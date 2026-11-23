function drawCastle(canvas){
 const w=1200,h=360,c=canvas.getContext('2d');canvas.width=w;canvas.height=h;
 let seed=291;function rand(){seed=seed*16807%2147483647;return seed/2147483647}
 function shape(points,color,stroke){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke()}}
 for(let i=0;i<170;i++){c.fillStyle='#c5bc88';c.globalAlpha=rand()*.65;c.fillRect(rand()*w,rand()*240,1.5,1.5)}c.globalAlpha=1;
 c.fillStyle='#d7c890';c.beginPath();c.arc(965,70,31,0,7);c.fill();c.strokeStyle='#a79e69';c.beginPath();c.arc(965,70,36,0,7);c.stroke();
 for(let j=0;j<3;j++){let pts=[[400,h]];for(let x=400;x<1240;x+=12)pts.push([x,220+j*30+35*Math.sin(x*.012+j)+18*Math.cos(x*.023+j)+rand()*6]);pts.push([1240,h]);shape(pts,['#355247','#29483c','#223e32'][j])}
 function tower(x,y,b,t){shape([[x,y],[x+b,y],[x+b,290],[x,290]],'#415647','#adab7f');shape([[x-5,y],[x+b/2,y-t],[x+b+5,y]],'#2b4539','#b4b18a');for(let k=3;k<b/2;k+=5){c.strokeStyle='#778974';c.beginPath();c.moveTo(x+b/2,y-t);c.lineTo(x+k,y);c.stroke()}for(let yy=y+10;yy<285;yy+=14){for(let xx=x+5;xx<x+b-4;xx+=9){c.fillStyle=rand()>.8?'#d8bb7c':'#2c4033';c.fillRect(xx,yy,3,7)}}}
 tower(853,171,37,51);tower(903,134,42,68);tower(947,176,31,49);tower(989,160,39,55);tower(1035,184,30,47);shape([[870,214],[908,178],[989,178],[1025,214],[1025,288],[870,288]],'#53604a','#b0ac83');shape([[867,215],[907,177],[990,177],[1028,215]],'#344c3d','#b0ac83');for(let x=883;x<1020;x+=14){c.fillStyle='#d2b67b';c.fillRect(x,229,4,12)}tower(844,217,28,39);tower(1018,215,29,38);
 for(let i=0;i<190;i++){let x=510+rand()*720,y=300+Math.sin(x*.011)*18+rand()*50,t=10+rand()*54;for(let j=0;j<3;j++)shape([[x,y-t+j*t*.23],[x-t*(.12+j*.035),y-t*.55+j*t*.24],[x+t*(.12+j*.035),y-t*.55+j*t*.24]],'#19382c')}
 const fade=c.createLinearGradient(260,0,720,0);fade.addColorStop(0,'#16372d');fade.addColorStop(1,'#16372d00');c.fillStyle=fade;c.fillRect(0,0,720,h)
}
