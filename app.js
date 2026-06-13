const categoryImages={
 'Bildungslücke':'bildungsluecke.png','Boulevard':'boulevard.png','Der Mensch':'der-mensch.png','Essen & Trinken':'essen-trinken.png','Heiße Kartoffel':'heisse-kartoffel.png','In der Natur':'in-der-natur.png','Kultur & Geschichte':'kultur-geschichte.png','Medien & Unterhaltung':'medien-unterhaltung.png','Typisch Deutsch':'typisch-deutsch.png','Um den Globus':'um-den-globus.png','Wenn nicht jetzt, wann dann?':'wenn-nicht-jetzt.png','Wer bin Ich':'wer-bin-ich.png','Wissenschaft & Technik':'wissenschaft-technik.png','Religion & Glaube':'religion-glaube.png'
};
let S={players:[],rounds:1,round:1,current:0,playsThisTurn:0,questions:[],cards:[],currentQ:null,selectedCard:null,log:[],usedQuestionIds:[],pendingDraws:{},categoryCounts:{}};
let ONLINE=false, DB=null, ROOM=null, MY_ID=localStorage.getItem('quizpoker_my_id')||crypto.randomUUID(), IS_HOST=false, REMOTE=false, UNSUB=null;
localStorage.setItem('quizpoker_my_id', MY_ID);
const app=document.getElementById('app');
const $=s=>document.querySelector(s);
const rand=a=>a[Math.floor(Math.random()*a.length)];
function weightedRand(items){
  const total=items.reduce((sum,item)=>sum+(Number(item.weight)||1),0);
  let r=Math.random()*total;
  for(const item of items){
    r-=Number(item.weight)||1;
    if(r<=0) return item;
  }
  return items[items.length-1];
}
function slug(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/&/g,'und').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function log(t){S.log.unshift(t);}
function score(i,n){S.players[i].score+=n; log(`${S.players[i].name}: ${n>0?'+':''}${n} Punkt(e)`);}
async function init(){
  try{
    S.questions=await fetch('questions.json').then(r=>r.json());
    S.cards=await fetch('cards.json').then(r=>r.json());
  }catch(e){
    S.questions=window.QUIZPOKER_QUESTIONS||[];
    S.cards=window.QUIZPOKER_CARDS||[];
  }
  S.questions=normalizeQuestions(S.questions);
  if(!S.questions.length||!S.cards.length){
    app.innerHTML='<div class="wrap"><section class="panel"><h1>Quizpoker</h1><p>Die Spieldaten konnten nicht geladen werden.</p></section></div>';
    return;
  }
  renderHome();
}

function normalizeQuestions(list){
  return (list||[]).map(q=>{
    q={...q};
    const combined=`${q.category||''} ${q.question||''} ${q.correct||''} ${q.answer||''}`.toLowerCase();
    if(q.type!=='schaetzfrage' && /(schätz|schaetz|schätzen|schaetzen)/i.test(combined)) q.type='schaetzfrage';
    if(q.category==='Wenn nicht jetzt, wann dann?') q.type='schaetzfrage';
    return q;
  });
}
function isSpecial(q){ return ['wer_bin_ich','heisse_kartoffel','schaetzfrage'].includes(q&&q.type); }
function noSpecial(q){ return !isSpecial(q); }
function playerOptions(excludeCurrent=true){return S.players.map((p,i)=>excludeCurrent&&i===S.current?'':`<option value="${i}">${p.name}</option>`).join('')}
function playerChecks(name,excludeCurrent=true){return S.players.map((p,i)=>excludeCurrent&&i===S.current?'':`<label class="check"><input type="checkbox" name="${name}" value="${i}"> ${p.name}</label>`).join('')}
function checked(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>+x.value)}

function firebaseConfigured(){
  const f=window.QUIZPOKER_FIREBASE;
  return !!(f && f.firebaseEnabled && f.config && f.config.apiKey && !String(f.config.apiKey).includes('DEIN_'));
}
function initFirebase(){
  if(!firebaseConfigured()) return false;
  try{
    if(!firebase.apps.length) firebase.initializeApp(window.QUIZPOKER_FIREBASE.config);
    DB=firebase.firestore();
    return true;
  }catch(e){ console.error(e); return false; }
}
function roomRef(code=ROOM){ return DB.collection('quizpoker_rooms').doc(String(code).toUpperCase()); }
function code(){ return Math.random().toString(36).slice(2,6).toUpperCase(); }
function renderHome(){
  const ready=initFirebase();
  app.innerHTML=`<div class="wrap"><section class="hero"><h1>Quizpoker</h1><p>Lokaler Prototyp + Multiplayer-Basis über Firebase.</p></section><section class="panel"><h2>Start</h2><div class="row"><div class="field"><h3>Lokal testen</h3><p class="muted">Funktioniert ohne Internet und ohne Firebase.</p><button id="local">Lokales Spiel starten</button></div><div class="field"><h3>Multiplayer</h3>${ready?`<label>Dein Name</label><input id="onlineName" placeholder="Name"><label>Raumcode</label><input id="roomCode" placeholder="z. B. ABCD"><button id="createRoom">Raum erstellen</button> <button class="secondary" id="joinRoom">Raum beitreten</button>`:`<p class="muted">Firebase ist noch nicht aktiviert. Trage deine Daten in <b>firebase-config.js</b> ein und setze <b>firebaseEnabled: true</b>.</p>`}</div></div></section></div>`;
  $('#local').onclick=()=>renderSetup();
  if(ready){
    $('#createRoom').onclick=createOnlineRoom;
    $('#joinRoom').onclick=joinOnlineRoom;
  }
}
async function createOnlineRoom(){
  const name=$('#onlineName').value.trim();
  if(!name) return alert('Bitte Namen eintragen.');
  ROOM=code(); IS_HOST=true; ONLINE=true;
  await roomRef().set({status:'lobby',hostId:MY_ID,rounds:1,players:[{id:MY_ID,name,score:0}],createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  watchRoom();
}
async function joinOnlineRoom(){
  const name=$('#onlineName').value.trim(); const rc=$('#roomCode').value.trim().toUpperCase();
  if(!name||!rc) return alert('Bitte Name und Raumcode eintragen.');
  ROOM=rc; ONLINE=true; IS_HOST=false;
  const ref=roomRef(); const snap=await ref.get();
  if(!snap.exists) return alert('Raum nicht gefunden.');
  const data=snap.data();
  const players=(data.players||[]).filter(p=>p.id!==MY_ID); players.push({id:MY_ID,name,score:0});
  await ref.update({players,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  watchRoom();
}
function watchRoom(){
  if(UNSUB) UNSUB();
  UNSUB=roomRef().onSnapshot(snap=>{
    if(!snap.exists) return;
    const data=snap.data();
    if(data.status==='lobby') renderOnlineLobby(data);
    if(data.status==='playing' && data.state){ REMOTE=true; S=data.state; REMOTE=false; renderGame(); }
    if(data.status==='ended' && data.state){ REMOTE=true; S=data.state; REMOTE=false; endGame(false); }
  });
}
function renderOnlineLobby(data){
  app.innerHTML=`<div class="wrap"><section class="hero"><h1>Quizpoker</h1><p>Raumcode: <b class="big">${ROOM}</b></p></section><section class="panel"><h2>Lobby</h2><p>${IS_HOST?'Du bist Spielleiter.':'Warte, bis der Spielleiter startet.'}</p><div>${(data.players||[]).map(p=>`<div class="score"><span>${p.name}</span><b>bereit</b></div>`).join('')}</div>${IS_HOST?`<label>Rundenanzahl</label><input id="roundsOnline" type="number" min="1" value="${data.rounds||1}"><button id="startOnline">Spiel starten</button>`:''}</section></div>`;
  if(IS_HOST) $('#startOnline').onclick=()=>startOnlineGame(data.players||[]);
}
async function startOnlineGame(players){
  if(players.length<2) return alert('Bitte mindestens 2 Spieler.');
  S.players=players.map(p=>({id:p.id,name:p.name,score:0,hand:drawHand(5)}));
  S.usedQuestionIds=[]; S.pendingDraws={}; S.categoryCounts={};
  S.rounds=Math.max(1,parseInt($('#roundsOnline').value||1)); S.round=1; S.current=0; S.playsThisTurn=0; S.log=[];
  log('Multiplayer-Spiel gestartet.'); drawQuestion();
  await saveRoom('playing');
}
async function saveRoom(status='playing'){
  if(!ONLINE || !DB || !ROOM || REMOTE) return;
  try{ await roomRef().set({status,state:S,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); }catch(e){ console.error(e); }
}

function renderSetup(){app.innerHTML=`<div class="wrap"><section class="hero"><h1>Quizpoker</h1><p>Lokaler Prototyp: Spieler eintragen, Runden wählen, Karten ziehen.</p></section><section class="panel"><div class="row"><div class="field"><label>Spieler, jeweils eine Zeile</label><textarea id="names" rows="6">Erik\nLisa\nTom</textarea></div><div class="field"><label>Rundenanzahl</label><input id="rounds" type="number" min="1" value="1"><p class="muted">Eine Runde = jeder Spieler kommt einmal dran und spielt 3 Handkarten.</p><button id="start">Spiel starten</button></div></div></section></div>`;$('#start').onclick=()=>{ONLINE=false; const names=$('#names').value.split('\n').map(x=>x.trim()).filter(Boolean);if(names.length<2)return alert('Bitte mindestens 2 Spieler eintragen.');S.players=names.map(n=>({name:n,score:0,hand:drawHand(5)}));S.usedQuestionIds=[];S.pendingDraws={};S.categoryCounts={};S.rounds=Math.max(1,parseInt($('#rounds').value||1));S.round=1;S.current=0;S.playsThisTurn=0;log('Spiel gestartet.');drawQuestion();renderGame();};}
function drawHand(n){return Array.from({length:n},()=>weightedRand(S.cards));}
function drawQuestion(category=null, excludeSpecial=false){
  S.currentQ=takeQuestion(category, excludeSpecial);
  S.selectedCard=null;
}
function takeQuestion(category=null, excludeSpecial=false){
  let pool=S.questions.filter(q=>(!category||q.category===category)&&!S.usedQuestionIds.includes(q.id));
  if(excludeSpecial) pool=pool.filter(q=>noSpecial(q));
  if(!pool.length){
    pool=S.questions.filter(q=>(!category||q.category===category));
    if(excludeSpecial) pool=pool.filter(q=>noSpecial(q));
  }
  if(!pool.length) pool=S.questions.filter(q=>!S.usedQuestionIds.includes(q.id));
  if(!pool.length){ S.usedQuestionIds=[]; pool=S.questions.slice(); log('Der Fragenstapel wurde neu gemischt.'); }

  let q;
  if(category){
    q=rand(pool);
  }else{
    q=takeBalancedByCategory(pool);
  }
  if(q&&q.id&&!S.usedQuestionIds.includes(q.id)) S.usedQuestionIds.push(q.id);
  if(q&&q.category) S.categoryCounts[q.category]=(S.categoryCounts[q.category]||0)+1;
  return q;
}
function takeBalancedByCategory(pool){
  const available=[...new Set(pool.map(q=>q.category))];
  const min=Math.min(...available.map(cat=>S.categoryCounts[cat]||0));
  const candidateCats=available.filter(cat=>(S.categoryCounts[cat]||0)===min);
  const chosenCat=rand(candidateCats);
  return rand(pool.filter(q=>q.category===chosenCat));
}
function refillHand(playerIndex){
  const p=S.players[playerIndex];
  while(p.hand.length<5) p.hand.push(weightedRand(S.cards));
  S.pendingDraws[playerIndex]=0;
}
function active(){return S.players[S.current];}
function renderShell(center=''){app.innerHTML=`<div class="wrap"><div class="layout"><aside class="panel"><h2>Punkte</h2>${S.players.map((p,i)=>`<div class="score ${i===S.current?'active':''}"><span>${p.name}</span><b>${p.score}</b></div>`).join('')}<p><span class="pill">Runde ${S.round}/${S.rounds}</span><span class="pill">${active().name} ist dran</span><span class="pill">Aktion ${S.playsThisTurn+1}/3</span></p></aside><section>${center}</section><aside class="panel"><h2>Protokoll</h2><div class="log">${S.log.map(x=>`<div>${x}</div>`).join('')}</div></aside></div></div>`;}
function renderGame(){
  const q=S.currentQ; const img=categoryImages[q.category]||`${slug(q.category)}.png`; const special=isSpecial(q);
  if(special){ startSpecial(); return; }
  renderShell(`<div class="panel center"><h2>Gezogene Quizkarte</h2><div class="category-card draw-anim"><img class="card-img" src="${img}" onerror="this.style.display='none'"></div><p class="big">${q.category}</p><p>${active().name}, spiele eine Handkarte aus.</p><div class="hand">${active().hand.map((c,i)=>`<button class="mini hand-anim" style="animation-delay:${i*70}ms" data-i="${i}"><img src="${c.image}"><b>${c.name}</b></button>`).join('')}</div></div>`);
  document.querySelectorAll('.mini').forEach(b=>b.onclick=()=>playCard(+b.dataset.i));
}
function playCard(i){S.selectedCard=active().hand[i];active().hand.splice(i,1);S.pendingDraws[S.current]=(S.pendingDraws[S.current]||0)+1;log(`${active().name} spielt „${S.selectedCard.name}“.`);if(S.selectedCard.id==='ich_bin_dran') askSingle(S.current,true);else if(S.selectedCard.id==='du_bist_dran') chooseTarget('Wer soll antworten?',(target,pred)=>askSingle(target,true,S.current,pred));else if(S.selectedCard.id==='ihr_seid_dran') predictMajority();else if(S.selectedCard.id==='fragenhagel') chooseTarget('Wer bekommt den Fragenhagel?',(target)=>fragenhagel(target));else if(S.selectedCard.id==='direktes_duell') chooseTarget('Gegen wen duellierst du dich?',(target)=>duell(target));}
function questionBox(q){let ans=''; if(q.answers&&q.answers.length) ans=`<div class="answers">${q.answers.map(a=>`<button class="ans" data-a="${a}">${a}</button>`).join('')}</div>`; else ans=`<input id="free" placeholder="Antwort eintippen"><button id="show">Antwort zeigen</button>`;return `<div class="question"><div class="pill">${q.category}</div><h2>${q.question}</h2>${ans}<div id="result"></div></div>`;}
function askSingle(playerIndex,finish=true,predictor=null,pred=null,cb=null,q=S.currentQ){renderShell(`<div class="panel"><h2>${S.players[playerIndex].name} antwortet</h2>${questionBox(q)}<div id="controls"></div></div>`);setupAnswer(q,(correct)=>{if(correct)score(playerIndex,1); if(predictor!==null){ if((correct?'richtig':'falsch')===pred)score(predictor,1); } if(cb) cb(correct); else nextAction();});}

function askCheck(playerIndex,cb,q=S.currentQ){
  renderShell(`<div class="panel"><h2>${S.players[playerIndex].name} antwortet</h2>${questionBox(q)}<div id="controls"></div></div>`);
  setupAnswer(q,(correct)=>cb(correct));
}

function setupAnswer(q,done){if(q.answers&&q.answers.length){document.querySelectorAll('.ans').forEach(b=>b.onclick=()=>{let correct=norm(b.dataset.a)===norm(q.correct);$('#result').innerHTML=`<p><b>${correct?'Richtig':'Falsch'}.</b> Richtige Antwort: ${q.correct}</p><button id="next">Weiter</button>`;$('#next').onclick=()=>done(correct);});}else{$('#show').onclick=()=>{$('#result').innerHTML=`<p>Gegebene Antwort: <b>${$('#free').value||'—'}</b></p><p>Richtige Antwort: <b>${q.correct||q.solution}</b></p><button id="right">Richtig</button> <button class="secondary" id="wrong">Falsch</button>`;$('#right').onclick=()=>done(true);$('#wrong').onclick=()=>done(false);};}}
function norm(x){return String(x||'').trim().toLowerCase().replace(/[.!?]/g,'')}
function chooseTarget(title,cb){renderShell(`<div class="panel"><h2>${title}</h2>${S.players.map((p,i)=>i===S.current?'':`<button class="target" data-i="${i}">${p.name}</button>`).join(' ')}<div id="pred" style="margin-top:15px"></div></div>`);document.querySelectorAll('.target').forEach(b=>b.onclick=()=>{let t=+b.dataset.i;if(S.selectedCard.id==='du_bist_dran'){$('#pred').innerHTML=`<h3>Deine Einschätzung:</h3><button id="pr">${S.players[t].name} liegt richtig</button> <button id="pf">${S.players[t].name} liegt falsch</button>`;$('#pr').onclick=()=>cb(t,'richtig');$('#pf').onclick=()=>cb(t,'falsch');}else cb(t);});}
function predictMajority(){renderShell(`<div class="panel"><h2>Mehrheit einschätzen</h2><p>Glaubst du, die Mehrheit der anderen liegt richtig oder falsch?</p><button id="mr">Mehrheit richtig</button> <button id="mf">Mehrheit falsch</button></div>`);$('#mr').onclick=()=>askAll('richtig');$('#mf').onclick=()=>askAll('falsch');}
function askAll(pred){let others=S.players.map((_,i)=>i).filter(i=>i!==S.current);let results=[];function step(){if(!others.length){let corrects=results.filter(Boolean).length;let majority=corrects>results.length/2?'richtig':'falsch';if(majority===pred) score(S.current,1); else S.players.forEach((p,i)=>{if(i!==S.current)score(i,1)});nextAction();return;}let i=others.shift();askCheck(i,(c)=>{results.push(c);step();});}step();}
function fragenhagel(target){let chosen=[takeQuestion(S.currentQ.category,true),takeQuestion(S.currentQ.category,true),takeQuestion(S.currentQ.category,true)];let idx=0;function step(){if(idx>=3){nextAction();return;}askSingle(target,false,null,null,(c)=>{score(target,c?0:-1);idx++;step();},chosen[idx]);}step();}
function duell(target){let qs=[takeQuestion(S.currentQ.category,true),takeQuestion(S.currentQ.category,true),takeQuestion(S.currentQ.category,true)];let a=0,b=0,idx=0;function askP(player,cb){askCheck(player,(c)=>cb(c),qs[idx]);}function step(){if(idx>=3){if(a>b){score(S.current,a);score(target,-(a-b));}else if(b>a){score(target,b);score(S.current,-(b-a));}else log('Duell endet unentschieden.');nextAction();return;}askP(S.current,c1=>{if(c1)a++;askP(target,c2=>{if(c2)b++;idx++;step();});});}step();}
function startSpecial(){
const q=S.currentQ;
if(q.type==='heisse_kartoffel'){
renderShell(`<div class="panel"><h2>Heiße Kartoffel</h2><div class="question"><h2>${q.topic}</h2><p>Die anderen nennen reihum passende Begriffe. ${active().name} tippt vorher, wem zuerst nichts einfällt.</p></div><label>${active().name}s Tipp</label><select id="pred">${S.players.map((p,i)=>i===S.current?'':`<option value="${i}">${p.name}</option>`).join('')}</select><label>Wer ist tatsächlich zuerst raus?</label><select id="out">${S.players.map((p,i)=>i===S.current?'':`<option value="${i}">${p.name}</option>`).join('')}</select><button id="ok">Auswerten</button></div>`);
$('#ok').onclick=()=>{let pred=+$('#pred').value;let out=+$('#out').value;if(pred===out)score(S.current,1);score(out,-1);nextAction();};
}
else if(q.type==='wer_bin_ich'){
let clue=0;
renderShell(`<div class="panel"><h2>Wer bin ich?</h2><p>Lösung für aktiven Spieler: <b>${q.solution}</b></p><label>${active().name}s Tipp: Wer errät es?</label><div id="preds">${playerChecks('pred')}</div><div id="clues" class="question"></div><button id="nextclue">Nächste Eigenschaft</button><label>Wer hat es richtig erraten?</label><div id="winners">${playerChecks('winner')}</div><button id="done">Auswerten</button></div>`);
function upd(){ $('#clues').innerHTML=q.clues.slice(0,clue).map((c,i)=>`<p><b>${i+1}.</b> ${c}</p>`).join('')||'<p>Noch keine Eigenschaft.</p>';}
upd();
$('#nextclue').onclick=()=>{if(clue<5)clue++;upd();};
$('#done').onclick=()=>{let winners=checked('winner');let preds=checked('pred');if(!winners.length)return alert('Bitte mindestens einen richtigen Spieler auswählen.');let pts=Math.max(1,6-Math.max(1,clue));winners.forEach(w=>score(w,pts));if(preds.some(p=>winners.includes(p)))score(S.current,pts);nextAction();};
}
else {
renderShell(`<div class="panel"><h2>${q.category==='Wenn nicht jetzt, wann dann?'?'Wenn nicht jetzt, wann dann?':'Schätzfrage'}</h2><label>${active().name}s Tipp: Wer liegt richtig oder am nächsten dran?</label><select id="pred">${S.players.map((p,i)=>i===S.current?'':`<option value="${i}">${p.name}</option>`).join('')}</select><div class="question"><h2>${q.question}</h2><p>Antwort: <b>${q.correct}</b></p></div><label>Wer lag richtig oder gleich nah dran?</label><div id="winners">${S.players.map((p,i)=>i===S.current?'':`<label class="check"><input type="checkbox" value="${i}"> ${p.name}</label>`).join('')}</div><button id="ok">Auswerten</button></div>`);
$('#ok').onclick=()=>{let pred=+$('#pred').value;let winners=[...document.querySelectorAll('#winners input:checked')].map(x=>+x.value);if(!winners.length)return alert('Bitte mindestens einen richtigen/nächsten Spieler auswählen.');if(winners.includes(pred)){score(S.current,1);winners.forEach(i=>score(i,1));}else winners.forEach(i=>score(i,2));nextAction();};
}}
function nextAction(){
  S.playsThisTurn++;
  if(S.playsThisTurn>=3){
    const finished=S.current;
    refillHand(finished);
    log(`${S.players[finished].name} zieht auf 5 Handkarten nach.`);
    S.playsThisTurn=0;
    S.current++;
    if(S.current>=S.players.length){S.current=0;S.round++;}
  }
  if(S.round>S.rounds) return endGame();
  drawQuestion();
  saveRoom('playing');
  renderGame();
}
function endGame(save=true){ if(save) saveRoom('ended'); let max=Math.max(...S.players.map(p=>p.score));let winners=S.players.filter(p=>p.score===max);renderShell(`<div class="panel center"><h1>Spielende</h1>${S.players.slice().sort((a,b)=>b.score-a.score).map((p,i)=>`<p class="big">${i+1}. ${p.name}: ${p.score}</p>`).join('')}${winners.length>1?`<p>Gleichstand: Stichfrage nötig zwischen ${winners.map(w=>w.name).join(', ')}.</p>`:`<h2>Gewonnen hat ${winners[0].name}!</h2>`}<button onclick="location.reload()">Neues Spiel</button></div>`);}
init();
