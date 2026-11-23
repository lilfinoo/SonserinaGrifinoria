const $=s=>document.querySelector(s), app=$('#app'), modal=$('#modal'), form=$('#form');
const dailyPoolSize=80; // Same ranked catalog as the server.
const houses={G:'🦁 Grifinória',S:'🐍 Sonserina',C:'🦅 Corvinal',L:'🦡 Lufa-Lufa'};
let user=null,cards=[],portraits={},room=null,local=null,poll,afterLogin,stamp='',page=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateBR=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
async function api(route,data={}){
 const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await r.json();if(!r.ok)throw Error(result.error);return result
}
function message(e){const el=modal.open?$('#form .err'):null;if(el)el.textContent=e.message;else{$('#toast').textContent=e.message;setTimeout(()=>$('#toast').textContent='',3500)}}
function show(html){form.innerHTML=html+'<p role="alert" class="err"></p>';form.querySelector('h2').id='dialog-title';if(!modal.open)modal.showModal()}
function stop(){clearInterval(poll);room=null;local=null;stamp='';page++}
const houseTraits={G:'Coragem',S:'Ambição',C:'Curiosidade',L:'Lealdade'};
function sparks(count){
 return '<div class="sparks" aria-hidden="true">'+Array.from({length:count},(_,i)=>
  `<i style="--x:${(i*61+7)%100}%;--y:${(i*37+13)%100}%;--delay:${-(i%9)*.61}s">✦</i>`
 ).join('')+'</div>';
}
function home(){
 stop();
 delete app.dataset.motionKey;
 $('#home').setAttribute('aria-current','page');
 $('#ranking').removeAttribute('aria-current');
 $('#dashboard').removeAttribute('aria-current');
 app.innerHTML=`<section class="hero">
  <canvas aria-hidden="true"></canvas>${sparks(24)}
  <div class="hero-copy">
   <div class="eyebrow"><span aria-hidden="true">✦</span> Desafio diário</div>
   <h1><span>O veredito</span><br><em>do dia</em></h1>
   <p>Dez personagens, quatro casas. Em qual delas você colocaria cada um?</p>
   <button class="gold" data-act="daily">Jogar o diário <span aria-hidden="true">→</span></button>
  </div>
 </section>
 <section class="game-modes" aria-labelledby="mode-title">
  <h2 id="mode-title">Escolha como jogar</h2>
  <div class="grid">
   <button class="tile" data-act="free"><span class="icon" aria-hidden="true">✧</span><span><strong>Partida livre</strong><small>Escolha a categoria e jogue no seu ritmo.</small></span><span class="arrow" aria-hidden="true">↗</span></button>
   <button class="tile" data-act="multi"><span class="icon" aria-hidden="true">☽</span><span><strong>Multiplayer</strong><small>Abra uma sala para até quatro jogadores.</small></span><span class="arrow" aria-hidden="true">↗</span></button>
  </div>
 </section>`;
 drawCastle($('canvas'));
}
function syncDashboard(){ $('#dashboard').hidden=!user||user.toLowerCase()!=='mateus'; }
async function dashboard(){
 stop();
 if(!user||user.toLowerCase()!=='mateus'){home();return}
 $('#home').removeAttribute('aria-current');$('#ranking').removeAttribute('aria-current');$('#dashboard').setAttribute('aria-current','page');
 const generation=page;
 app.innerHTML='<section class="panel dashboard-panel"><div class="eyebrow">✦ Área reservada</div><h1>Painel</h1><p>Acompanhamento do Salão das Casas.</p><div id="dashboard-stats" class="dashboard-grid" role="status">Carregando o painel…</div></section>';
 try{
  const stats=await api('dashboard');
  if(page!==generation)return;
  $('#dashboard-stats').innerHTML=[['Contas',stats.users],['Resultados registrados',stats.results],['Salas em andamento',stats.rooms],['Personagens no catálogo',stats.characters]].map(([label,value])=>'<article class="dashboard-stat"><span>'+esc(label)+'</span><strong>'+Number(value).toLocaleString('pt-BR')+'</strong></article>').join('');
 }catch(e){if(page===generation)$('#dashboard-stats').innerHTML='<p class="err" role="alert">'+esc(e.message)+'</p>'}
}
function auth(register=false){
 show(`<h2>${register?'Criar conta':'Entrar no salão'}</h2><form id="auth"><label>Usuário<input name="name" minlength="3" maxlength="24" autocomplete="username" required></label><label>Senha<input name="password" type="password" minlength="6" maxlength="128" autocomplete="${register?'new':'current'}-password" required></label><button class="primary">${register?'Criar conta':'Entrar'}</button></form><div class="choices"><button id="switch">${register?'Já tenho conta':'Criar uma conta'}</button><button id="guest">Continuar como convidado</button></div>`);
 $('#switch').onclick=()=>auth(!register);$('#guest').onclick=()=>{afterLogin=null;modal.close();home()};
 $('#auth').onsubmit=async e=>{e.preventDefault();try{const result=await api(register?'register':'login',Object.fromEntries(new FormData(e.target)));user=result.user;$('#account').textContent=user;syncDashboard();modal.close();const fn=afterLogin;afterLogin=null;if(fn)await fn()}catch(e){message(e)}}
}
function configure(multi=false){
 show(`<h2>${multi?'Sala multiplayer':'Partida livre'}</h2>${multi?'<label>Modo<select id="mode"><option value="daily">Diário · vale ranking</option><option value="free">Partida livre</option></select></label>':''}<div id="options"><label>Categoria<select id="category">${['Todas','Filmes','Séries','Animes','Famosos reais'].map(c=>'<option>'+c+'</option>').join('')}</select></label><label>Subcategoria<select id="group"></select></label><label>Personagens<select id="count"><option>5</option><option selected>10</option><option>20</option></select></label><p id="count-hint" class="muted" role="status"></p></div><button class="primary" id="go">${multi?'Criar sala':'Começar partida'}</button>${multi?'<hr class="sep"><label>Código da sala<input id="code" placeholder="Código do anfitrião" maxlength="8"></label><button id="join">Entrar na sala</button>':'<p class="muted">Disponível offline · Fora do ranking</p>'}`);
 if(multi){$('#options').hidden=true;$('#mode').onchange=e=>$('#options').hidden=e.target.value==='daily';$('#join').onclick=()=>net('join',{code:$('#code').value.trim().toUpperCase()})}
 const updateCounts=()=>{
  const available=freePool($('#category').value,$('#group').value).length;
  const count=$('#count'), selected=count.value;
  for(const option of count.options)option.disabled=Number(option.value)>available;
  if(Number(selected)>available)count.value='5';
  $('#count-hint').textContent=available<20 ? 'Esta seleção tem '+available+' personagens. As opções acima dessa quantidade ficam indisponíveis para evitar repetições.' : '';
 };
 const updateGroups=()=>{
  const names=[...new Set(freePool($('#category').value,'').flatMap(card=>card.groups||[]))];
  $('#group').innerHTML='<option value="">Todas</option>'+names.map(name=>'<option>'+esc(name)+'</option>').join('');
  updateCounts();
 };
 $('#category').onchange=updateGroups;
 $('#group').onchange=updateCounts;
 updateGroups();
 $('#go').onclick=()=>{const options={mode:multi?$('#mode').value:'free',count:Number($('#count').value),category:$('#category').value,group:$('#group').value,multi};if(multi)net('create',options);else startLocal(options)}
}
function freePool(category,group){
 return cards.filter(card=>(category==='Todas'||card.category===category)&&(!group||card.groups?.includes(group)))
}
function startLocal({mode,category,group,count}){
 modal.close();stop();const daily=mode==='daily',day=dateBR();let deck=daily?cards.slice(0,dailyPoolSize):freePool(category,group),seed=Number(day.replaceAll('-',''));
 for(let i=deck.length-1;i>0;i--){seed=seed*16807%2147483647;const j=daily?seed%(i+1):Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
 local={deck:deck.slice(0,daily?10:count),i:0,score:0,pick:null,daily};localRender()
}
function localRender(){const {deck,i,pick,score,daily}=local,card=deck[i];render({phase:!card?'done':pick?'reveal':'vote',index:i,total:deck.length,card,house:card?.house,why:card?.why,votes:{Você:pick},voted:pick?['Você']:[],players:['Você'],scores:{Você:score},daily,multi:false})}
async function net(action,data){
 try{const state=await api(action,data);modal.close();stop();room=state;sessionStorage.setItem('sala',state.code);stamp=JSON.stringify(state);render(state);
 if(state.phase==='done')sessionStorage.removeItem('sala');
 else if(state.multi){const generation=page;poll=setInterval(async()=>{try{const s=await api('state',{code:state.code});if(generation!==page||stamp===JSON.stringify(s))return;room=s;stamp=JSON.stringify(s);render(s);if(s.phase==='done'){clearInterval(poll);sessionStorage.removeItem('sala')}}catch{}},1200)}
 }catch(e){message(e)}
}
function characterPortrait(card){
 const portrait=portraits[card.name];
 if(!portrait)return '<div class="portrait-seal" aria-hidden="true"><span>✦</span></div>';
 return `<figure class="character-portrait"><img src="${esc(portrait.url)}" alt="${esc(card.name)}" decoding="async"><figcaption><a href="${esc(portrait.source)}" target="_blank" rel="noopener noreferrer">Fonte da imagem ↗</a></figcaption></figure>`
}
app.addEventListener('error',e=>{if(e.target.matches('.character-portrait img'))e.target.closest('figure').outerHTML='<div class="portrait-seal" aria-hidden="true"><span>✦</span></div>'},true);
function render(s){
 const me=local?'Você':user,isHost=local||s.host===user;
 let html='<p class="muted">'+(s.multi?'Multiplayer · Sala '+esc(s.code):local?'Partida no aparelho':'Solo online')+' · '+(s.daily?'Desafio diário':'Partida livre')+'</p>';
 if(s.phase==='lobby'){html+='<h1>Sala de jogo</h1><p>Compartilhe o código <b>'+esc(s.code)+'</b> com seus amigos.</p>'+names(s.players.map(p=>[p,'Pronto']))+(isHost?'<button class="primary" data-act="start" '+(s.players.length<2?'disabled':'')+'>Começar partida</button>':'<p>Aguardando o anfitrião.</p>')}
 else if(s.phase==='done'){html+='<h1>Placar final</h1>'+names(Object.entries(s.scores).sort((a,b)=>b[1]-a[1]).map(([p,v])=>[p,v+' / '+s.total]))+'<button data-act="home">Voltar ao salão</button>'}
 else{const card=s.card;html+=`<p class="chapter"><span>Personagem ${s.index+1} de ${s.total}</span><span>${esc(card.category)}</span></p><div class="progress" aria-hidden="true"><i style="transform:scaleX(${(s.index+1)/s.total})"></i></div><div class="character"><div><h1>${esc(card.name)}</h1><b>${esc(card.work)}</b><p>${esc(card.desc)}</p></div>${characterPortrait(card)}</div>`;
 if(s.phase==='vote'){html+=s.voted.includes(me)?'<p class="waiting" role="status">✦ Voto registrado. Aguardando os demais ('+s.voted.length+'/'+s.players.length+').</p>':'<h3>Qual casa combina mais?</h3><div class="houses">'+Object.entries(houses).map(([k,v])=>'<button data-house="'+k+'"><span>'+v+'</span><small>'+houseTraits[k]+'</small></button>').join('')+'</div>'}
 else{html+='<section class="verdict" data-tone="'+s.house+'">'+sparks(11)+'<div class="eyebrow">Casa sugerida</div><h3 tabindex="-1">'+houses[s.house]+'</h3><p>'+esc(s.why)+'</p></section>'+names(Object.entries(s.votes).map(([p,v])=>[p,houses[v]+(v===s.house?' · +1':' · 0')]))+(isHost?'<button class="primary" data-act="next">'+(s.index+1===s.total?'Ver placar':'Próximo personagem')+' →</button>':'<p>Aguardando o anfitrião continuar.</p>')}}
 const motionKey=[s.code,s.day,s.phase,s.index,s.card?.name].join('|');
 const changed=app.dataset.motionKey!==motionKey;
 app.dataset.motionKey=motionKey;
 app.innerHTML='<section class="panel game-panel'+(changed?' enter':'')+'" data-phase="'+s.phase+'">'+html+'</section>';
 if(s.phase==='reveal'&&changed) $('.verdict h3').focus({preventScroll:true});
}
function names(items){return '<ul class="list">'+items.map(([a,b])=>'<li><b>'+esc(a)+'</b><span>'+esc(b)+'</span></li>').join('')+'</ul>'}
async function rank(period='dia'){stop();$('#home').removeAttribute('aria-current');$('#ranking').setAttribute('aria-current','page');$('#dashboard').removeAttribute('aria-current');const generation=page;app.innerHTML='<section class="panel"><h1>Ranking</h1><p>Os pontos da primeira conclusão do diário de cada conta.</p><div class="choices">'+Object.entries({dia:'Diário',semana:'Semanal',geral:'Geral'}).map(([k,v])=>'<button class="'+(period===k?'primary':'')+'" data-period="'+k+'">'+v+'</button>').join('')+'</div><div id="rows" role="status">Carregando…</div></section>';try{const rows=await api('rank',{period});if(page===generation)$('#rows').innerHTML=rows.length?names(rows.map((r,i)=>[(i+1)+'. '+r.user,r.points+' pts'])):'Ainda não há pontuações neste período.'}catch{if(page===generation)$('#rows').textContent='Conecte-se para ver o ranking.'}}
function daily(){if(user&&navigator.onLine)net('create',{mode:'daily',multi:false});else{show('<h2>Desafio diário</h2><p>Jogue como convidado neste aparelho ou entre na sua conta para disputar o ranking.</p><div class="choices"><button id="practice">Jogar sem ranking</button><button id="signin" class="primary">Jogar valendo pontos</button></div>');$('#practice').onclick=()=>startLocal({mode:'daily'});$('#signin').onclick=()=>{afterLogin=daily;auth()}}}
app.onclick=e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.act,k=b.dataset.house;if(k){if(local){local.pick=k;local.score+=Number(local.deck[local.i].house===k);localRender()}else net('vote',{code:room.code,index:room.index,house:k})}
 if(a==='next'){if(local){local.i++;local.pick=null;localRender()}else net('next',{code:room.code,index:room.index})}
 if(a==='start')net('start',{code:room.code});if(a==='daily')daily();if(a==='free')configure();if(a==='multi'){if(user)configure(true);else{afterLogin=()=>configure(true);auth()}}if(a==='home')home();if(a==='dashboard')dashboard();if(b.dataset.period)rank(b.dataset.period)};
$('#home').onclick=home;$('#ranking').onclick=()=>rank();$('#dashboard').onclick=dashboard;$('.close').onclick=()=>modal.close();$('#account').onclick=()=>{afterLogin=null;if(!user)return auth();show('<h2>'+esc(user)+'</h2><button id="logout">Sair da conta</button>');$('#logout').onclick=async()=>{try{await api('logout');user=null;syncDashboard();sessionStorage.removeItem('sala');$('#account').textContent='Entrar ↗';modal.close();home()}catch(e){message(e)}}};
(async()=>{[cards,portraits]=await Promise.all([fetch('/cards.json').then(r=>r.json()),fetch('/portraits.json').then(r=>r.json()).catch(()=>({}))]);try{user=(await api('me')).user}catch{}if(user)$('#account').textContent=user;syncDashboard();home();if(user&&sessionStorage.getItem('sala'))net('state',{code:sessionStorage.getItem('sala')});if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
})().catch(()=>{app.innerHTML='<section class="panel"><h1>O salão não abriu</h1><p>Atualize a página para carregar o catálogo.</p><a class="primary retry" href="/">Tentar de novo</a></section>'});
