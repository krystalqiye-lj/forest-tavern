from pathlib import Path
import re

root = Path(__file__).resolve().parents[3]
preview = root / 'outputs' / '林间拾叶-溪边木牌版.html'
source = preview.read_text()

source = source.replace('<section class="start"><h1>林间拾叶</h1><button id="enter">走进草地</button></section>', '')
source = source.replace('<button class="mark" aria-label="回到当前场景">❧</button><button class="menu" aria-controls="side" aria-expanded="false">☷ 菜单</button>', '''<button class="mark" aria-label="收起森林">← 收起森林</button>
<div class="forest-tools">
<button class="catalog-toggle" type="button" aria-controls="catalog" aria-expanded="false">植物图鉴</button>
<button class="menu" aria-controls="side" aria-expanded="false">☁ 天气与声音</button>
</div>''')
begin = source.index('<article class="reader"')
end = source.index('<script>', begin)
source = source[:begin] + '''<aside class="side" id="side" aria-label="天气与声音" hidden><div id="panel"></div></aside>
<section id="catalog" class="catalog" aria-label="植物图鉴" hidden>
<header><h1>植物图鉴</h1><button class="close-catalog" type="button" aria-label="关闭图鉴">×</button></header>
<p class="catalog-count"></p>
<input class="catalog-search" type="search" aria-label="搜索角色或植物" placeholder="搜索角色或植物">
<ul class="catalog-entries"></ul>
</section>
<p class="forest-status" role="status" hidden></p>
''' + source[end:]
source = source.replace('</style>', '''
.forest-tools{position:fixed;top:22px;right:16px;z-index:4;display:flex;gap:6px}
.forest-tools .menu,.catalog-toggle{position:static;background:#f5f4dfeb;border:1px solid #fff7;border-radius:50px;padding:7px 12px;font-size:13px}
.mark{left:16px;font-size:13px;padding:7px 12px}
.catalog{position:fixed;z-index:6;right:16px;top:70px;bottom:16px;width:min(390px,calc(100% - 32px));background:#f4f0e0;box-shadow:0 15px 50px #17251c66;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column}
.catalog header{display:flex;justify-content:space-between;align-items:center}
.catalog h1{font-size:21px;margin:0}
.close-catalog{border:0;background:none;font-size:24px;line-height:1.5}
.catalog-count{margin:3px 0 8px;color:#5a6650;font-size:13px}
.catalog-search{padding:9px;border:1px solid #bac4ad;background:#fffaf0;color:#243527;border-radius:9px;font:inherit}
.catalog-entries{overflow:auto;list-style:none;margin:8px 0 0;padding:0}
.catalog-entries button{display:flex;gap:6px;justify-content:space-between;align-items:center;width:100%;padding:9px 4px;background:none;border:0;border-bottom:1px solid #d9ddc9;text-align:left}
.catalog-entries button:hover{background:#e5ead7}
.catalog-entries small{font-size:12px;color:#5e6a52}
.forest-status{position:fixed;z-index:7;left:50%;bottom:18px;transform:translateX(-50%);padding:8px 14px;margin:0;background:#f5f0da;border-radius:9px}
</style>''', 1)

source = re.sub(r'const characters=\[.*?\n\];', '', source, count=1, flags=re.S)
source = source.replace("const choices=document.querySelector('.plants'),reader=document.querySelector('.reader'),start=document.querySelector('.start'),side=document.querySelector('.side'),menu=document.querySelector('.menu');\nlet last={index:0,location:'oak'};", '''const choices=document.querySelector('.plants');
const side=document.querySelector('.side');
const menu=document.querySelector('.menu');
const catalog=document.querySelector('#catalog');
const catalogToggle=document.querySelector('.catalog-toggle');
const status=document.querySelector('.forest-status');
let cards=[];
let selecting=false;''')
source = source.replace("exitLabel:'↑ 去小溪边',backLabel:'← 回到树下',characters", "exitLabel:'↑ 去小溪边'")
source = re.sub(r",backLabel:'← 回到溪边',characters:\[.*?\n \]", "", source, count=1, flags=re.S)
source = source.replace('let lastPlant=null;\n', '')
source = source.replace("async function travel(button){\n if(traveling)return;", "async function travel(button){\n if(traveling||selecting)return;")
start = source.index('function ground(')
end = source.index('function positionButton(', start)
source = source[:start] + '''function closeMenu(){
 side.hidden=true;
 menu.setAttribute('aria-expanded','false');
}
function closeCatalog(){
 catalog.hidden=true;
 catalogToggle.setAttribute('aria-expanded','false');
}
function send(type, payload={}){
 parent.postMessage({forestTavern:type,...payload},location.origin);
}
function resetApproach(){
 selecting=false;
 status.hidden=true;
 choices.hidden=false;
 setPlantsDisabled(false);
 moveCamera('none',480);
}
async function openCard(card, plant){
 if(selecting||traveling)return;
 selecting=true;
 status.hidden=true;
 closeMenu();
 closeCatalog();
 setPlantsDisabled(true);
 if(plant)await approach(plant);
 send('character',{id:card.id});
}
''' + source[end:]
source = source.replace('for(const [index,[name]] of location.characters.entries()){','for(const card of cards.filter(card=>card.place===locationId)){')
source = source.replace('label.textContent=name;','label.textContent=card.name;')
source = source.replace('location.positions[index]','location.positions[card.slot]').replace('openStory(index);','openCard(card,button);')
source = source.replace("arrow.onclick=()=>travel(arrow);\n choices.append(arrow);",'''arrow.onclick=()=>travel(arrow);
 choices.append(arrow);
 setPlantsDisabled(selecting||traveling);''')
source = source.replace(" choices.querySelector('.trail')?.focus({preventScroll:true});\n veil.classList.remove('covered');\n traveling=false;",''' traveling=false;
 setPlantsDisabled(false);
 choices.querySelector('.trail')?.focus({preventScroll:true});
 veil.classList.remove('covered');''')
start = source.index("document.querySelector('#enter').onclick")
source = source[:start] + '''function renderCatalog(){
 const query=catalog.querySelector('.catalog-search').value.trim().toLocaleLowerCase();
 catalog.querySelector('.catalog-count').textContent='已收录 '+cards.length+' 株';
 const items=cards.filter(card=>[card.name,card.species].some(value=>value.toLocaleLowerCase().includes(query)));
 const list=catalog.querySelector('.catalog-entries');
 list.replaceChildren();
 for(const card of items){
  const item=document.createElement('li');
  const button=document.createElement('button');
  button.type='button';
  const name=document.createElement('strong');
  name.textContent=card.name;
  const plantName=document.createElement('small');
  const place={oak:'大树下',creek:'溪边'}[card.place];
  plantName.textContent=[card.species,place].filter(Boolean).join(' · ');
  button.append(name,plantName);
  button.onclick=()=>{
   if(card.place&&card.place!==locationId){
    showLocation(card.place);
    camera.style.transform='none';
   }
   const buttonInScene=card.place?choices.querySelectorAll('.plant:not(.trail)')[
    cards.filter(item=>item.place===card.place).findIndex(item=>item.id===card.id)
   ]:null;
   openCard(card,buttonInScene);
  };
  item.append(button);
  list.append(item);
 }
 if(items.length===0){
  const empty=document.createElement('li');
  empty.textContent=cards.length?'没有找到匹配的角色':'导入角色卡后，植物会出现在这里。';
  list.append(empty);
 }
}
document.querySelector('.mark').onclick=()=>send('close');
menu.onclick=()=>{
 const visible=side.hidden;
 closeCatalog();
 side.hidden=!visible;
 menu.setAttribute('aria-expanded',String(visible));
 if(visible)weatherPanel(document.querySelector('#panel'));
};
catalogToggle.onclick=()=>{
 const visible=catalog.hidden;
 closeMenu();
 catalog.hidden=!visible;
 catalogToggle.setAttribute('aria-expanded',String(visible));
 if(visible)renderCatalog();
};
catalog.querySelector('.close-catalog').onclick=closeCatalog;
catalog.querySelector('.catalog-search').oninput=renderCatalog;
window.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 if(!catalog.hidden)closeCatalog();
 else if(!side.hidden)closeMenu();
 else send('close');
});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent)return;
 const message=event.data;
 if(message?.forestTavern==='catalog'){
  cards=message.cards;
  renderPlants();
  renderCatalog();
 }
 if(message?.forestTavern==='failed'){
  resetApproach();
  status.textContent='打开角色失败，请重试。';
  status.hidden=false;
 }
 if(message?.forestTavern==='view'){
  const {mode}=message;
  const wasReading=document.body.classList.contains('forest-book-backdrop');
  document.body.classList.toggle('forest-book-backdrop',mode==='reading');
  if(mode==='forest'){
   if(wasReading)resetApproach();
   if(!reduced.matches)clip.play().catch(()=>{});
  }else{
   ++visit;
   traveling=false;
   veil.classList.remove('covered');
   closeCatalog();
   closeMenu();
   if(mode==='closed'){
    resetApproach();
    clip.pause();
   }
  }
 }
});
choices.hidden=false;
send('ready');
</script>
</body></html>
'''
source = source.replace(" traveling=true;\n closeMenu();", " traveling=true;\n catalogToggle.disabled=true;\n closeMenu();")
source = source.replace(" traveling=false;\n setPlantsDisabled(false);", " traveling=false;\n catalogToggle.disabled=false;\n setPlantsDisabled(false);")
source = source.replace("   traveling=false;\n   veil", "   traveling=false;\n   catalogToggle.disabled=false;\n   veil")
source = source.replace(" selecting=true;\n status.hidden=true;", " const currentVisit=++visit;\n selecting=true;\n status.hidden=true;")
source = source.replace(" if(plant)await approach(plant);\n send", " if(plant)await approach(plant);\n if(currentVisit!==visit)return;\n send")
source = source.replace('return motion.finished.catch(()=>{});',"""return Promise.race([
  motion.finished.catch(()=>{}),
  new Promise(resolve=>setTimeout(resolve,duration+100))
 ]);""")
source = source.replace('.catalog-entries small{',""".catalog-entries button{display:grid;grid-template-columns:84px 1fr;gap:10px;padding:7px 4px}
.plant-portrait{display:block;width:84px;aspect-ratio:1.44;background:#efebdc url(plant-plates.jpg) no-repeat;background-size:500% 600%;border:1px solid #c8ccba;border-radius:8px}
.catalog-copy{display:flex;flex-direction:column;justify-content:center;min-width:0}
.catalog-entries small{""")
source = source.replace('  button.append(name,plantName);',"""  const picture=document.createElement('span');
  picture.className='plant-portrait';
  picture.setAttribute('aria-hidden','true');
  const plate=card.art%30;
  picture.style.backgroundPosition=(plate%5*25)+'% '+(Math.floor(plate/5)*20)+'%';
  const copy=document.createElement('span');
  copy.className='catalog-copy';
  copy.append(name,plantName);
  button.append(picture,copy);""")
source = source.replace('</style>',"""
.mark,.forest-tools{display:none}
body.forest-book-backdrop :is(.field-station,.plants,.forest-status){display:none}
body.forest-book-backdrop::after{content:'';position:fixed;inset:0;pointer-events:none;background:linear-gradient(#14231938,#14231908 34%,#1820144d);z-index:4}
.field-station{position:fixed;z-index:3;bottom:5%;left:50%;transform:translateX(-50%);display:flex;align-items:end;gap:clamp(6px,2vw,20px);padding:5px 12px;max-width:100%;isolation:isolate}
.field-station::before{content:'';position:absolute;z-index:-1;inset:44% 2% -8px;background:#19190d78;filter:blur(8px);border-radius:50%}
.field-prop,.field-signs button{border:0;color:#f4e8ca;text-shadow:0 1px 2px #22170e;cursor:pointer}
.field-prop{position:relative;display:grid;place-items:center;width:clamp(44px,9vw,70px);height:48px;padding:0;font-size:11px;line-height:1.2;background:none;isolation:isolate}
.field-prop::before{content:'';position:absolute;z-index:-1;inset:4px 2px 7px;transform:rotate(-5deg);border-radius:4px;background:repeating-linear-gradient(4deg,#59432c,#694c32 4px,#755739 5px,#59432c 7px);box-shadow:inset 0 1px #bca274,2px 3px 4px #241a10bf}
.field-prop.book::before{background:linear-gradient(90deg,#302b1c 0 12%,#68734b 13% 89%,#ded0a2 91%);border:1px solid #a89a68;transform:rotate(-11deg)}
.field-prop.lantern::before{inset:0 10px 5px;background:radial-gradient(ellipse,#ac863e,#4b3620 77%);border:2px solid #6b5637;border-radius:10px 10px 4px 4px;transform:none}
.field-prop.stone::before{background:linear-gradient(155deg,#818570,#485645);border-radius:48% 41% 29% 35%;transform:rotate(6deg)}
.field-prop:hover::before,.field-prop:focus-visible::before{filter:brightness(1.3)}
.field-signs{position:absolute;bottom:58px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:repeat(2,minmax(85px,1fr));gap:5px;width:max-content;padding:10px 12px;background:#342b1edf;border:1px solid #b09867;border-radius:8px;box-shadow:0 10px 25px #17201690}
.field-signs button{padding:6px 8px;border-radius:3px;background:linear-gradient(5deg,#61472c,#775737);font-size:12px}
.field-signs button:hover{background:#8b6c45}
.catalog,.side{top:22px;bottom:90px}
.side{bottom:auto;max-height:calc(100dvh - 115px)}
</style>""",1)
source = source.replace('<p class="forest-status"',"""<nav class="field-station" aria-label="林间物件">
<button class="field-prop book" type="button" data-field="catalog">图鉴</button>
<button class="field-prop lantern" type="button" data-drawer="sys-settings-button">连接</button>
<button class="field-prop stone" type="button" data-field="weather">天气</button>
<button class="field-prop" type="button" data-field="signs" aria-expanded="false">木牌</button>
<button class="field-prop" type="button" data-field="close">收起森林</button>
<div class="field-signs" hidden>
<button type="button" data-drawer="ai-config-button">生成设置</button>
<button type="button" data-drawer="user-settings-button">用户设置</button>
<button type="button" data-drawer="WI-SP-button">世界书</button>
<button type="button" data-drawer="advanced-formatting-button">高级格式</button>
<button type="button" data-drawer="rightNavHolder">角色管理</button>
<button type="button" data-drawer="persona-management-button">我的人设</button>
<button type="button" data-drawer="extensions-settings-button">扩展</button>
<button type="button" data-drawer="backgrounds-button">背景</button>
</div>
</nav>
<p class="forest-status"
""".rstrip())
source = source.replace("choices.hidden=false;\nsend('ready');","""const station=document.querySelector('.field-station');
const signs=station.querySelector('.field-signs');
const signToggle=station.querySelector('[data-field=signs]');
station.addEventListener('click',event=>{
 const prop=event.target.closest('button');
 if(!prop)return;
 if(prop.dataset.field==='signs'){
  signs.hidden=!signs.hidden;
  signToggle.setAttribute('aria-expanded',String(!signs.hidden));
  return;
 }
 signs.hidden=true;
 signToggle.setAttribute('aria-expanded','false');
 if(prop.dataset.field==='catalog')catalogToggle.click();
 if(prop.dataset.field==='weather')menu.click();
 if(prop.dataset.field==='close')send('close');
 if(prop.dataset.drawer){
  closeCatalog();
  closeMenu();
  send('drawer',{id:prop.dataset.drawer});
 }
});
choices.hidden=false;
send('ready');""")
start = source.index('// Render the forest as a texture')
end = source.index('function playPhrase(){', start)
source = source[:start] + """const weatherTracks={
 breeze:'forest-ambience.mp3',
 wind:'forest-ambience.mp3',
 rain:'rain-ambience.mp3',
 storm:'storm-ambience.mp3'
};
function updateAudio(){
 if(!ambience)return;
 const recording=ambience.recording;
 const file=weatherTracks[weather];
 if(recording.getAttribute('src')!==file)recording.src=file;
 recording.volume={breeze:.40,wind:.49,rain:.42,storm:.36}[weather];
}
async function initAudio(){
 if(!audio){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw Error('AudioContext unavailable');
  audio=new Context();
 }
 await audio.resume();
}
function playAmbience(){
 ambience??={recording:new Audio(),enabled:false};
 ambience.recording.loop=true;
 ambience.enabled=true;
 updateAudio();
 return ambience.recording.play();
}
""" + source[end:]
source = source.replace("   if(audio&&ambience)playThunder();\n", "")
source = source.replace("if(storm&&t-lastThunder>9500)", "if(storm&&!reduced.matches&&t-lastThunder>9500)")
source = source.replace("lastThunder=performance.now()-4000;lightning=-1000;updateAudio();", """lastThunder=performance.now()-4000;lightning=-1000;
  if(reduced.matches)animate(0);
  if(ambience?.enabled)playAmbience().catch(error=>{
   if(error.name==='AbortError')return;
   ambience.enabled=false;
   sound.checked=false;
   panel.querySelector('output').textContent='暂时无法播放这段环境音';
  });""")
source = source.replace("   if(input.checked)await initAudio();\n   if(input===sound){if(ambience)ambience.enabled=input.checked;updateAudio();return;}", """   if(input===sound){
    if(input.checked){
     await playAmbience();
    }else if(ambience){
     ambience.enabled=false;
     ambience.recording.pause();
    }
    return;
   }
   if(input.checked)await initAudio();""")
source = source.replace("}catch{input.checked=false;", "}catch{if(input===sound&&ambience){ambience.enabled=false;ambience.recording.pause();}input.checked=false;")
source = source.replace('<select aria-label="天气"></select>', '<div class="weather-options" role="group" aria-label="切换天气"></div>')
source = source.replace(""" const select=panel.querySelector('select');
 for(const [value,label] of Object.entries(weatherNames))select.add(new Option(label,value));
 select.value=weather;
 select.onchange=()=>{
  weather=select.value;scene.dataset.weather=weather;""", """ const options=panel.querySelector('.weather-options');
 for(const [value,label] of Object.entries(weatherNames)){
  const button=document.createElement('button');
  button.type='button';
  button.dataset.weatherOption=value;
  button.textContent=value==='rain'?'小雨':label;
  button.setAttribute('aria-pressed',String(weather===value));
  options.append(button);
 }
 options.addEventListener('click',event=>{
  const option=event.target.closest('[data-weather-option]');
  if(!option)return;
  weather=option.dataset.weatherOption;
  scene.dataset.weather=weather;
  for(const button of options.children)button.setAttribute('aria-pressed',String(button===option));""")
source = source.replace(" };\n const sound=panel.querySelector", " });\n const sound=panel.querySelector")
source = source.replace('</style>',"""
.weather-options{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px}
.side .weather-options button{border:1px solid #b8c5ae;border-radius:8px;text-align:center;min-height:42px}
.side .weather-options button[aria-pressed="true"]{background:#39563b;color:#fff7dc;border-color:#39563b}
</style>""",1)

# The mobile camera translates the video and its interactive layer together.
source = source.replace('width=device-width,initial-scale=1', 'width=device-width,initial-scale=1,viewport-fit=cover')
source = source.replace('</style>', '</style>\n<link rel="stylesheet" href="forest-mobile.css?v=1.0.3">', 1)
source = source.replace('<div class="view">', '<div class="view" tabindex="0" aria-label="森林场景，可左右拖动或用方向键看景">', 1)
source = re.sub(r'<button class="mark"[^>]*>.*?</button>', '', source, count=1)
source = source.replace('<button class="field-prop" type="button" data-field="close">收起森林</button>', '', 1)
source = source.replace('<ul class="catalog-entries"></ul>', '''<ul class="catalog-entries"></ul>
<details class="catalog-colophon">
<summary>图鉴封底</summary>
<label class="forest-start-setting">进入森林时
<select class="forest-start-scene">
<option value="oak">大树下</option>
<option value="creek">小溪边</option>
</select>
</label>
<button type="button" class="theme-switch" hidden>前往星间</button>
<output class="colophon-status" aria-live="polite"></output>
</details>''', 1)
source = source.replace('<p class="forest-status"', '<p class="pan-hint" aria-hidden="true">左右滑动看风景</p>\n<p class="forest-status"', 1)
source = source.replace('<script>', '<script src="forest-camera.js?v=1.0.3"></script>\n<script>', 1)
source = re.sub(r'\.trail \.sign(?:\:\:before)?\{[^}]+\}\n|\.trail:hover \.sign\{[^}]+\}\n', '', source)
source = source.replace("""let locationId='oak';
let clip=clips.oak;""", """const startSceneKey='forest-tavern-start-scene';
let locationId='oak';
try{
 if(localStorage.getItem(startSceneKey)==='creek')locationId='creek';
}catch{}
scene.dataset.place=locationId;
for(const [id,video] of Object.entries(clips))video.hidden=id!==locationId;
let clip=clips[locationId];""")

start = source.index('let motion, visit=0;')
end = source.index('let traveling=false;', start)
source = source[:start] + '''let visit=0;
let readingBackdrop=false;
const panHint=document.querySelector('.pan-hint');
const cameraControl=createForestCamera(view,camera,choices,reduced,{
 canPan:()=>!selecting&&!traveling&&!readingBackdrop&&catalog.hidden&&side.hidden&&signs.hidden,
 onPan:()=>{panHint.hidden=true;}
});
cameraControl.setScene(locationId);
cameraControl.reset();
''' + source[end:]
source = source.replace("exit:[50,58],exitLabel:'↑ 去小溪边'", "exit:[54.1,66],exitLabel:'去小溪边'")
source = source.replace("exitLabel:'← 回到大树'", "exitLabel:'回到大树'")
source = source.replace("locationId=id;scene.dataset.place=id;", "locationId=id;scene.dataset.place=id;cameraControl.setScene(id);")
source = source.replace("await approach(button,1.19,420)", "await cameraControl.approach(button,1.19,420)")
source = source.replace("await moveCamera('none',0)", "await cameraControl.reset()")
source = source.replace(" choices.querySelector('.trail')?.focus({preventScroll:true});", " view.focus({preventScroll:true});")
source = source.replace("moveCamera('none',480);", "return cameraControl.reset(360);")
source = source.replace(" if(plant)await approach(plant);", " if(plant)await cameraControl.approach(plant);")
source = source.replace("send('character',{id:card.id});", "send('character',{id:card.id,via:'catalog'});")
source = source.replace("  button.onclick=event=>{\n   if(event.pointerType", "  button.dataset.id=card.id;\n  button.onclick=async event=>{\n   if(event.pointerType")
source = source.replace("   openCard(card,button);", """   if(selecting||traveling)return;
   const currentVisit=++visit;
   selecting=true;
   panHint.hidden=true;
   closeMenu();
   setPlantsDisabled(true);
   await cameraControl.approach(button,1.43,530);
   if(currentVisit!==visit)return;
   selecting=false;
   setPlantsDisabled(false);
   showCatalog(card.id);
   cameraControl.reset(380);
""")
source = source.replace("""  const sign=document.createElement('i');
  sign.className='sign';
  sign.textContent='↑';
  sign.setAttribute('aria-hidden','true');
  arrow.append(sign);""", """  const sign=document.createElement('img');
  sign.className='trail-wood';
  sign.src='creek-trail-sign.webp';
  sign.alt='';
  sign.draggable=false;
  arrow.append(sign);""")
source = source.replace("direction.textContent=location.exitLabel.slice(2);", "direction.textContent=location.exitLabel;")
source = source.replace("function renderCatalog(){", """function showCatalog(id){
 closeMenu();
 catalog.hidden=false;
 catalogToggle.setAttribute('aria-expanded','true');
 if(id)catalog.querySelector('.catalog-search').value='';
 renderCatalog();
 if(!id)return;
 const item=catalog.querySelector('[data-role="'+CSS.escape(id)+'"]');
 if(item){
  item.dataset.near='';
  item.scrollIntoView({block:'nearest'});
  item.focus({preventScroll:true});
 }
}
function renderCatalog(){""")
source = source.replace("""  const button=document.createElement('button');
  button.type='button';
  const name=document.createElement('strong');""", """  const button=document.createElement('button');
  button.type='button';
  button.dataset.role=card.id;
  const name=document.createElement('strong');""")
source = source.replace("""  button.onclick=()=>{
   if(card.place&&card.place!==locationId){
    showLocation(card.place);
    camera.style.transform='none';
   }
   const buttonInScene=card.place?choices.querySelectorAll('.plant:not(.trail)')[
    cards.filter(item=>item.place===card.place).findIndex(item=>item.id===card.id)
   ]:null;
   openCard(card,buttonInScene);
  };""", "  button.onclick=()=>openCard(card);")
source = source.replace("document.querySelector('.mark').onclick=()=>send('close');", """const startScene=catalog.querySelector('.forest-start-scene');
const colophonStatus=catalog.querySelector('.colophon-status');
startScene.value=locationId;
startScene.addEventListener('change',()=>{
 try{
  localStorage.setItem(startSceneKey,startScene.value);
  colophonStatus.textContent='下次会直接进入'+startScene.selectedOptions[0].textContent+'。';
 }catch{
  colophonStatus.textContent='暂时无法保存入口场景。';
 }
});
catalog.querySelector('.theme-switch').onclick=()=>send('switch-theme');""")
source = source.replace(""" const visible=catalog.hidden;
 closeMenu();
 catalog.hidden=!visible;
 catalogToggle.setAttribute('aria-expanded',String(visible));
 if(visible)renderCatalog();""", """ if(catalog.hidden)showCatalog();
 else closeCatalog();""")
source = source.replace(" else send('close');", " else if(!signs.hidden)signToggle.click();")
source = source.replace("""  renderPlants();
  renderCatalog();
 }
 if(message?.forestTavern==='failed'){""", """  renderPlants();
  if(!catalog.hidden)renderCatalog();
 }
 if(message?.forestTavern==='theme-option') {
  catalog.querySelector('.theme-switch').hidden=!message.available;
 }
 if(message?.forestTavern==='theme-failed'){
  colophonStatus.textContent=message.text;
 }
 if(message?.forestTavern==='failed'){""")
source = source.replace("""  status.textContent='打开角色失败，请重试。';
  status.hidden=false;""", """  showCatalog();
  status.textContent=message.text||'打开角色失败，请重试。';
  status.hidden=false;""")
source = source.replace("""  const wasReading=document.body.classList.contains('forest-book-backdrop');
  document.body.classList.toggle('forest-book-backdrop',mode==='reading');""", """  const wasReading=readingBackdrop;
  readingBackdrop=mode==='reading';
  document.body.classList.toggle('forest-book-backdrop',readingBackdrop);""")
source = source.replace("""   if(wasReading)resetApproach();""", """   if(wasReading){
    closeCatalog();
    resetApproach();
   }""")
source = source.replace(" if(prop.dataset.field==='close')send('close');", "")
source = source.replace("const panHint=document.querySelector('.pan-hint');", """const panHint=document.querySelector('.pan-hint');
const signs=document.querySelector('.field-signs');""")
source = source.replace("const signs=station.querySelector('.field-signs');\n", "")
source = source.replace("async function openCard(card, plant){", "function openCard(card){")
source = source.replace(""" if(plant)await cameraControl.approach(plant);
 if(currentVisit!==visit)return;
 send('character'""", """ send('character'""")
source = source.replace("""function openCard(card){
 if(selecting||traveling)return;
 const currentVisit=++visit;""", """function openCard(card){
 if(selecting||traveling)return;
 ++visit;""")
source = source.replace("catalog.querySelector('.close-catalog').onclick=closeCatalog;", """catalog.querySelector('.close-catalog').addEventListener('click',event=>{
 event.preventDefault();
 event.stopPropagation();
 closeCatalog();
 document.querySelector('[data-field="catalog"]').focus({preventScroll:true});
});""")

(root / 'work' / 'forest-tavern' / 'build' / 'legacy-forest-preview.html').write_text(source)
