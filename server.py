import datetime as dt
import hashlib
import hmac
import json
import os
import random
import re
import secrets
import sqlite3
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

from validate_catalog import validate_portraits

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
CARDS = json.loads((PUBLIC / 'cards.json').read_text())
# Keep the ranked deck stable as the free-play catalog grows.
DAILY_POOL_SIZE = 80
DB = os.environ.get('GAME_DB', str(ROOT / 'jogo.sqlite'))
def database():
    con = sqlite3.connect(DB, isolation_level=None, timeout=8)
    con.row_factory = sqlite3.Row
    return con

def today():
    return dt.datetime.now(ZoneInfo('America/Sao_Paulo')).date()

def require(test, message):
    if not test:
        raise ValueError(message)

def password(value, salt):
    return hashlib.pbkdf2_hmac("sha256", value.encode(), bytes.fromhex(salt), 600000).hex()

def snapshot(room, user):
    i = room['index']
    result = {k:room[k] for k in ('code','players','phase','index','host','daily','multi','day','scores')}
    result['total'] = len(room['deck'])
    result['voted'] = list(room['votes'])
    if room['phase'] in ('vote','reveal'):
        card = CARDS[room['deck'][i]]
        result['card'] = {k:card[k] for k in ('name','work','category','desc')}
        if room['phase'] == 'reveal':
            result.update(house=card['house'], why=card['why'], votes=room['votes'])
    return result

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(PUBLIC),**kwargs)

    def do_POST(self):
        con = database()
        try:
            length = int(self.headers.get('Content-Length',0))
            require(0 < length < 8192 and self.headers.get_content_type()=='application/json','Pedido inválido.')
            args = json.loads(self.rfile.read(length))
            require(isinstance(args,dict),'Pedido inválido.')
            jar = cookies.SimpleCookie(self.headers.get('Cookie',''))
            token = jar['sid'].value if 'sid' in jar else ''
            row = con.execute('select user from sessions where token=?',(token,)).fetchone()
            user = row[0] if row else None
            con.execute('begin immediate')
            self.cookie = None
            result = self.action(con,self.path,args,user,token)
            con.commit()
            self.reply(200,result)
        except (ValueError,KeyError,TypeError) as err:
            con.rollback()
            self.reply(400,{'error':str(err)})
        finally:
            con.close()

    def reply(self,status,data):
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        if status==200 and self.cookie is not None:
            self.send_header('Set-Cookie','sid='+self.cookie+'; Path=/; HttpOnly; SameSite=Strict')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def action(self,c,path,a,user,token):
        if path in ('/api/login','/api/register'):
            name=a.get('name','').strip()
            pw=a.get('password','')
            require(re.fullmatch(r'[\w.-]{3,24}',name) and 6<=len(pw)<=128,'Use um usuário de 3 a 24 caracteres e senha de 6 a 128.')
            row=c.execute('select * from users where name=? collate nocase',(name,)).fetchone()
            if path.endswith('register'):
                require(not row,'Esse usuário já existe.')
                salt=secrets.token_hex(16)
                c.execute('insert into users values(?,?,?)',(name,salt,password(pw,salt)))
            else:
                require(row and hmac.compare_digest(row['hash'],password(pw,row['salt'])),'Usuário ou senha incorretos.')
                name=row['name']
            self.cookie=secrets.token_urlsafe(32)
            c.execute('insert into sessions values(?,?)',(self.cookie,name))
            return {'user':name}
        if path=='/api/me': return {'user':user}
        if path=='/api/logout':
            c.execute('delete from sessions where token=?',(token,))
            self.cookie=''
            return {}
        if path=='/api/rank':
            day=today()
            start={'dia':day,'semana':day-dt.timedelta(days=day.weekday()),'geral':dt.date.min}[a['period']]
            return [dict(r) for r in c.execute('select user,sum(points) points from results where day between ? and ? group by user order by points desc,user collate nocase',(start.isoformat(),day.isoformat()))]
        if path=='/api/dashboard':
            require(user and user.lower()=='mateus','Este painel é exclusivo do usuário mateus.')
            return {'users':c.execute('select count(*) from users').fetchone()[0],
                    'results':c.execute('select count(*) from results').fetchone()[0],
                    'rooms':c.execute("select count(*) from rooms where json_extract(data,'$.phase')!='done'").fetchone()[0],
                    'characters':len(CARDS)}
        require(user,'Entre na sua conta para jogar online.')
        if path=='/api/create':
            daily=a['mode']=='daily'
            day=today().isoformat()
            if daily:
                pool=list(range(DAILY_POOL_SIZE))
            else:
                group=a.get('group')
                pool=[i for i,card in enumerate(CARDS)
                      if (a['category']=='Todas' or card['category']==a['category'])
                      and (not group or group in card.get('groups',[]))]
            n=10 if daily else a['count']
            require(n in (5,10,20) and len(pool)>=n,'Seleção inválida.')
            if daily:
                seed=int(day.replace('-',''))
                for i in range(len(pool)-1,0,-1):
                    seed=seed*16807%2147483647
                    j=seed%(i+1)
                    pool[i],pool[j]=pool[j],pool[i]
                deck=pool[:10]
            else:
                deck=random.SystemRandom().sample(pool,n)
            code=secrets.token_hex(4).upper()
            multi=bool(a['multi'])
            room=dict(code=code,host=user,players=[user],daily=daily,multi=multi,day=day,deck=deck,index=0,phase='lobby' if multi else 'vote',votes={},scores={user:0})
        else:
            row=c.execute('select data from rooms where code=?',(a.get('code',''),)).fetchone()
            require(row,'Sala não encontrada.')
            room=json.loads(row[0])
            if path=='/api/join' and user not in room['players']:
                require(room['multi'] and room['phase']=='lobby' and len(room['players'])<4,'Sala lotada ou já iniciada.')
                room['players'].append(user)
                room['scores'][user]=0
            require(user in room['players'],'Você não participa desta sala.')
            phase=room['phase']
            if path=='/api/start':
                require(user==room['host'] and phase=='lobby' and len(room['players'])>=2,'Aguarde outro jogador.')
                room['phase']='vote'
            elif path=='/api/vote':
                require(phase=='vote' and a['index']==room['index'] and user not in room['votes'] and a['house'] in ('G','S','C','L'),'Voto indisponível.')
                room['votes'][user]=a['house']
                if len(room['votes'])==len(room['players']):
                    room['phase']='reveal'
                    for p,v in room['votes'].items():
                        room['scores'][p]+=int(v==CARDS[room['deck'][room['index']]]['house'])
                    if room['daily'] and room['index']==len(room['deck'])-1:
                        for p,s in room['scores'].items():
                            c.execute('insert or ignore into results values(?,?,?)',(p,room['day'],s))
            elif path=='/api/next':
                require(user==room['host'] and phase=='reveal' and a['index']==room['index'],'Aguarde o anfitrião.')
                room['index']+=1
                room['votes']={}
                room['phase']='done' if room['index']==len(room['deck']) else 'vote'
            elif path=='/api/state': return snapshot(room,user)
            elif path!='/api/join': raise ValueError('Ação inválida.')
        c.execute('insert or replace into rooms values(?,?)',(room['code'],json.dumps(room)))
        return snapshot(room,user)

if __name__=='__main__':
    validate_portraits(CARDS)
    database().executescript('''
    create table if not exists users(name text primary key collate nocase,salt text,hash text);
    create table if not exists sessions(token text primary key,user text);
    create table if not exists results(user text,day text,points integer,primary key(user,day));
    create table if not exists rooms(code text primary key,data text);
    ''')
    ThreadingHTTPServer(('',int(os.environ.get('PORT',8080))),Handler).serve_forever()
