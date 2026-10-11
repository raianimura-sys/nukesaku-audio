import {NOTE_NAMES,MODES,QUALITIES,makeChord,chordName,chordNotes,diatonicChords,romanNumeral,transposeChords,voiceLead,PRESETS,NAMED_PRESETS,makePreset,totalBeats,arrangementEvents,createMidi,PATTERNS,BASIC_PATTERNS,ADVANCED_PATTERNS,SIMPLE_PATTERNS,COMPLEX_PATTERNS} from './music.js?v=2.0.0';
import {suggestNextChords} from './recommendations.js?v=2.0.0';
import {patternChoices,adjacentPattern} from './pattern-browser.js?v=2.0.0';
import {AudioEngine} from './audio.js?v=2.0.0';
import {createProject as defaults, validateProject} from './project.js?v=2.0.0';
import {SECTION_TYPES, MAX_SECTIONS, MAX_SONG_CHORDS, activeSection, sectionLabel, createSection, duplicateSection, syncSection, activateSection, songChordCount, performancePlan} from './sections.js?v=2.0.0';
import {progressionAlternatives, progressionSignature, shapeVoicings} from './composition.js?v=2.0.0';

const $=id=>document.getElementById(id);
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>JSON.parse(JSON.stringify(value));
const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number(n)||0));
const mod=n=>((n%12)+12)%12;
const uid=()=>globalThis.crypto?.randomUUID?.()??`project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const KEYS=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const STORAGE={draft:'harmony.draft.v1',library:'harmony.library.v1',picker:'harmony.pattern-picker.v1'};
const audio=new AudioEngine();
let toastTimer,saveTimer,activeChord=-1,palette=[],paletteTab='diatonic',chromaticRoot=0,midiBytes,midiUri,midiFilename,rollShown=true,dragIndex=null,touchDrag=null,lastFocused=null;
let candidateChoice=null,recommendations=[],suppressCandidateClickUntil=0;
let undoStack=[],redoStack=[],storageUnavailable=false,starting=false,playRequest=0;
let playbackPlan=null, playingSectionId=null, auditionLabel='', compareChoices=[], compareHistory=[], voicingChoices=[], alternativeRound=0;
let timelineNodes=[],arrangementLength=0,paintedChord=-1,paintedStep=-1,transportPhase='',modalMode=null,rhythmSearch='',rhythmFilter='simple',rhythmFeel='all',rhythmFavoritesOnly=false;

function readStorage(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
let state;try{const saved=readStorage(STORAGE.draft,null);state=saved?validateProject(saved):defaults();}catch{state=defaults();}
let library=readStorage(STORAGE.library,[]);if(!Array.isArray(library))library=[];
const savedPicker=readStorage(STORAGE.picker,{});let rhythmPrefs={autoplay:savedPicker?.autoplay!==false,favorites:Array.isArray(savedPicker?.favorites)?savedPicker.favorites.filter(id=>ADVANCED_PATTERNS.some(p=>p.id===id)):[]};

function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function autosave(){syncSection(state);clearTimeout(saveTimer);$('save-status').innerHTML='<i></i>保存中…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE.draft,JSON.stringify(state));$('save-status').innerHTML='<i></i>保存済み';storageUnavailable=false;}catch{$('save-status').textContent='保存できません';if(!storageUnavailable){toast('ブラウザに保存できません。ライブラリからJSONを保存してください。');storageUnavailable=true;}}},300);}
function stop(){playRequest++;starting=false;audio.stop();activeChord=-1;playbackPlan=null;playingSectionId=null;auditionLabel='';renderPlayback(0,-1);}
function mutate(action,{message,history=true}={}){syncSection(state);if(history){undoStack.push(clone(state));if(undoStack.length>70)undoStack.shift();redoStack=[];}stop();action(state);candidateChoice=null;state.selected=state.chords.length?Math.min(Math.max(0,state.selected),state.chords.length-1):-1;syncSection(state);render();autosave();if(message)toast(message);}
function undo(){if(!undoStack.length)return;stop();redoStack.push(clone(state));state=undoStack.pop();candidateChoice=null;render();autosave();toast('元に戻しました');}
function redo(){if(!redoStack.length)return;stop();undoStack.push(clone(state));state=redoStack.pop();candidateChoice=null;render();autosave();toast('やり直しました');}
function selected(){return state.chords[state.selected];}
function barBeats(){return state.settings.meter===6?3:state.settings.meter;}
function role(chord){const r=mod(chord.root-state.key),idx=MODES.find(m=>m.id===state.mode).intervals.indexOf(r);if([0,2,5].includes(idx))return 'tonic';if([1,3].includes(idx))return 'subdominant';return 'dominant';}
const colors={tonic:'#c1efb8',subdominant:'#bed7f6',dominant:'#ead0ef'};
const roleLabel={tonic:'Tonic',subdominant:'Subdominant',dominant:'Dominant'};
function noteLabel(pitch){return chordName(makeChord(mod(pitch),'maj'),state.key);}
function degreeLabel(chord){return romanNumeral(chord,state.key,state.mode);}
function notesLabel(chord){return chordNotes(chord,state.settings).map(noteLabel).join(' · ');}
function filename(){const name=(state.title.trim()||'Harmony').replace(/[\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\.+$/,'').slice(0,55);const scope=state.sections.length>1?'-'+(state.settings.playScope==='song'?'song':sectionLabel(activeSection(state),state.sections).split(' / ')[1].toLowerCase().replace(/[^a-z0-9]+/g,'-')):'';return `${name}-${KEYS[state.key].replace('♭','b').replace('♯','#')}-${state.settings.bpm}bpm${scope}.mid`;}
function file(){return new File([midiBytes],midiFilename,{type:'audio/midi'});}
function download(data,name,type){const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
function downloadMidi(){if(!performancePlan(state).chords.length){toast('コードを追加してから書き出してください。');return;}download(midiBytes,midiFilename,'audio/midi');toast(`${state.settings.playScope==='song'?'曲全体':sectionLabel(activeSection(state),state.sections)}のMIDIを保存しました。`);}
function prepareMidi(){try{const plan=performancePlan(state);midiBytes=createMidi(plan.chords,{...state.settings,sectionMarkers:plan.markers});midiFilename=filename();let binary='';for(const byte of midiBytes)binary+=String.fromCharCode(byte);midiUri='data:audio/midi;base64,'+btoa(binary);$('midi-filename').textContent=midiFilename;$('midi-drag').draggable=plan.chords.length>0;const canShare=!!(navigator.canShare&&navigator.canShare({files:[file()]}));$('share-midi').hidden=!canShare;$('share-midi').disabled=!plan.chords.length;}catch(error){toast('MIDIの生成に失敗しました。'+error.message);}}

function renderSections(){
 const current=activeSection(state),plan=performancePlan(state,'song'),index=state.sections.indexOf(current);
 $('section-tabs').innerHTML=state.sections.map(s=>{const name=sectionLabel(s,state.sections),[ja,en]=name.split(' / '),chords=s.id===state.activeSectionId?state.chords:s.chords;return `<button data-section="${esc(s.id)}" aria-pressed="${s.id===current.id}" class="section-chip ${s.id===current.id?'active':''}"><strong>${esc(ja)} <span>/ ${esc(en)}</span></strong><small>${+(totalBeats(chords)/barBeats()).toFixed(1)} bars · ${chords.length} chords</small></button>`;}).join('');
 const area=$('section-tabs'),chosen=area.querySelector('.active');if(chosen&&(chosen.offsetLeft<area.scrollLeft||chosen.offsetLeft+chosen.offsetWidth>area.scrollLeft+area.clientWidth))area.scrollLeft=Math.max(0,chosen.offsetLeft-8);
 $('song-summary').textContent=`${state.sections.length} sections · ${+(plan.beats/barBeats()).toFixed(1)} bars`;
 $('section-editing').textContent=`編集中：${sectionLabel(current,state.sections)}`;
 $('add-section').disabled=state.sections.length>=MAX_SECTIONS;
 $('copy-section').disabled=state.sections.length>=MAX_SECTIONS||songChordCount(state)+state.chords.length>MAX_SONG_CHORDS;
 $('delete-section').disabled=state.sections.length===1;$('section-left').disabled=index===0;$('section-right').disabled=index===state.sections.length-1;
 document.querySelectorAll('[data-play-scope]').forEach(b=>{const on=b.dataset.playScope===state.settings.playScope;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
}
function addSection(copy=false){
 if(state.sections.length>=MAX_SECTIONS)return;
 if(copy&&songChordCount(state)+state.chords.length>MAX_SONG_CHORDS)return;
 mutate(s=>{const section=copy?duplicateSection(activeSection(s)):createSection($('new-section-type').value);s.sections.splice(s.sections.indexOf(activeSection(s))+1,0,section);activateSection(s,section.id);},{message:copy?'セクションを複製しました':'セクションを追加しました'});
}
function deleteSection(){if(state.sections.length===1)return;mutate(s=>{const index=s.sections.indexOf(activeSection(s));s.sections.splice(index,1);const next=s.sections[Math.min(index,s.sections.length-1)];s.activeSectionId=next.id;s.chords=next.chords;s.selected=next.selected;},{message:'セクションを削除しました。元に戻すで復元できます。'});}
function moveSection(direction){const index=state.sections.indexOf(activeSection(state)),next=index+direction;if(next<0||next>=state.sections.length)return;mutate(s=>{const [section]=s.sections.splice(index,1);s.sections.splice(next,0,section);});}

function buildPalette(){
 if(paletteTab==='diatonic')palette=diatonicChords(state.key,state.mode,state.extension);
 else if(paletteTab==='borrowed'){
  const minor=state.mode==='minor';const specs=minor?[[0,'maj'],[5,'maj'],[7,'dom7'],[9,'min7'],[11,'dim'],[2,'maj'],[4,'maj']]:[[0,'min'],[5,'min'],[8,'maj'],[10,'maj'],[3,'maj'],[1,'maj'],[2,'dom7']];
  palette=specs.map(([interval,q])=>makeChord(mod(state.key+interval),state.extension==='triad'?q:(state.extension==='9th'?{maj:'maj9',min:'min9',dom7:'dom9'}:{maj:'maj7',min:'min7'})[q]||q));
 }else palette=Object.keys(QUALITIES).filter(q=>!['min7b9','m7b5b9'].includes(q)).map(q=>makeChord(chromaticRoot,q));
 $('chromatic-controls').hidden=paletteTab!=='all';
 $('chord-palette').innerHTML=palette.map((c,i)=>candidateCard(c,i,'palette')).join('');
 $('chord-palette').style.gridTemplateColumns=paletteTab==='all'?'repeat(auto-fill,minmax(100px,1fr))':'';
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===paletteTab);b.setAttribute('aria-pressed',b.dataset.tab===paletteTab);});
 $('palette-footnote').textContent=paletteTab==='borrowed'?'キーの外の響きで、彩りを。':'響き設定は、追加する候補だけに適用。';
 highlightCandidate();
}
function candidateCard(c,index,source,description=''){
 const name=esc(chordName(c,state.key)),data=`data-candidate-source="${source}" data-candidate-index="${index}"`;
 return `<div class="palette-chord candidate-card ${source==='recommendation'?'recommendation-card':''} ${name.length>6?'long-name':''}" ${data} draggable="true" style="--chord-color:${colors[role(c)]}"><button class="candidate-select" data-candidate-action="select" aria-label="${name}を選択して${source==='recommendation'?'つながりを':''}試聴" aria-pressed="false"><span class="roman">${esc(degreeLabel(c))}<span aria-hidden="true">▷</span></span><strong>${name}</strong><small>${source==='recommendation'?esc(recommendations[index].label):esc(QUALITIES[c.quality].label)}</small>${description?`<p>${esc(description)}</p>`:''}</button><div class="candidate-actions"><button class="candidate-grip" data-candidate-action="drag" aria-label="${name}を進行へドラッグ" title="進行へドラッグ">⠿</button><button class="candidate-plus" data-candidate-action="add" aria-label="${name}を進行に追加" title="選択中のコードの次に追加">${icon('plus')}<span>追加</span></button></div></div>`;
}
function candidateFromCard(card){return (card?.dataset.candidateSource==='palette'?palette:recommendations.map(item=>item.chord))[Number(card?.dataset.candidateIndex)];}
function highlightCandidate(){
 document.querySelectorAll('.candidate-card').forEach(card=>{const c=candidateFromCard(card),on=!!(candidateChoice&&c&&c.root===candidateChoice.root&&c.quality===candidateChoice.quality);card.classList.toggle('candidate-selected',on);card.querySelector('.candidate-select').setAttribute('aria-pressed',on);});
 const where=selected()?`${String(state.selected+1).padStart(2,'0')} ${chordName(selected(),state.key)}の次`:'進行の最初';
 $('candidate-status').textContent=candidateChoice?`${chordName(candidateChoice,state.key)}を選択中 · ＋で${where}へ`:`追加先：${where}`;
}
function renderRecommendations(){
 const c=selected(),context=recommendationSequence();recommendations=suggestNextChords({anchor:c,key:state.key,mode:state.mode,extension:state.extension,chords:context.chords,index:context.index,intent:state.recommendationIntent,loop:state.settings.loop});
 $('recommendation-intent').value=state.recommendationIntent;
 $('recommendation-context').textContent=c?`${String(state.selected+1).padStart(2,'0')}  ${chordName(c,state.key)} の次に`:'キーに合う響き';
 $('recommendation-note').textContent=c?'前後と進行全体を考えた候補。タップでつながりを試聴、＋かドラッグで追加。':'タップで試聴。＋かドラッグで追加。';
 $('continue-last').hidden=state.chords.length<2||state.selected===state.chords.length-1;
 $('recommendation-cards').innerHTML=recommendations.map((item,i)=>candidateCard(item.chord,i,'recommendation',item.reason)).join('');
 highlightCandidate();
}
function recommendationSequence(){
 if(state.settings.playScope!=='song'||!state.chords.length)return {chords:state.chords,index:state.selected};
 const plan=performancePlan(state,'song');return {chords:plan.chords,index:plan.origins.findIndex(o=>o.sectionId===state.activeSectionId&&o.index===state.selected)};
}
async function chooseCandidate(c,connection=false){
 if(!c)return;candidateChoice=clone(c);highlightCandidate();
 stop();
 const anchor=selected();if(!connection||!anchor){preview(c);return;}
 const request=++playRequest;starting=true;renderPlayback(0,-1);
 try{
  const context=recommendationSequence(),next=context.chords[context.index+1]||(state.settings.loop&&context.chords.length>1?context.chords[0]:null);
  await audio.start([anchor,c,...(next?[next]:[])].map(chord=>({...clone(chord),beats:1})),{...state.settings,loop:false,pattern:'block',bass:false,metronome:false,gate:1,humanize:0,swing:0},{onStop:()=>{if(request!==playRequest)return;starting=false;renderPlayback(0,-1);}});
  if(request!==playRequest)return;starting=false;renderPlayback(0,-1);
 }catch(error){if(request!==playRequest)return;stop();toast(error.message||'音声を開始できませんでした。');}
}
function addCandidate(c){if(c)addChord(c,selected()?state.selected+1:state.chords.length);}
function renderTimeline(){
 const scroll=$('chord-timeline').scrollLeft;
 $('chord-timeline').innerHTML=state.chords.length?state.chords.map((c,i)=>`<div class="timeline-chord ${chordName(c,state.key).length>6?'long-name':''} ${i===state.selected?'selected':''}" draggable="true" role="group" aria-label="${i+1}番目 ${esc(chordName(c,state.key))} ${c.beats}拍" data-index="${i}" style="--chord-color:${colors[role(c)]}"><div class="card-top"><span>${String(i+1).padStart(2,'0')}</span><div class="timeline-card-actions"><button class="timeline-lock ${c.locked?'locked':''}" aria-pressed="${c.locked}" aria-label="${i+1}番目 ${esc(chordName(c,state.key))}を${c.locked?'固定解除':'別案で固定'}" title="別案・響き調整でこのコードを固定" draggable="false">${icon('lock')}</button><span class="drag-grip" title="ドラッグで移動" aria-hidden="true">⠿</span><button class="timeline-delete" aria-label="${i+1}番目 ${esc(chordName(c,state.key))}を削除" title="このコードだけ削除" draggable="false">${icon('trash')}<span>削除</span></button></div></div><button class="timeline-select" aria-label="${i+1}番目 ${esc(chordName(c,state.key))}を選択" aria-pressed="${i===state.selected}"><strong>${esc(chordName(c,state.key))}</strong><span class="chord-role">${esc(degreeLabel(c))} · ${roleLabel[role(c)]}</span><span class="card-duration"><span>${c.beats} beats</span><span class="beat-dots">${Array.from({length:Math.min(8,Math.ceil(c.beats))},()=>'<i></i>').join('')}</span></span></button></div>`).join('')+`<button class="timeline-add" aria-label="コード候補から追加">${icon('plus')}</button>`:`<div class="empty-timeline">コード進行はここに<small>おすすめの＋を押すか、ここにドラッグ</small></div>`;
 $('chord-timeline').scrollLeft=scroll;
 let offset=0;timelineNodes=Array.from($('chord-timeline').querySelectorAll('[data-index]')).map((el,index)=>{const item={el,dots:Array.from(el.querySelectorAll('.beat-dots i')),start:offset};offset+=state.chords[index].beats;return item;});paintedChord=-1;paintedStep=-1;
 $('bar-count').textContent=`${+(totalBeats(state.chords)/barBeats()).toFixed(1)} BARS`;
 $('undo-button').disabled=!undoStack.length;$('redo-button').disabled=!redoStack.length;$('duplicate-all').disabled=!state.chords.length||state.chords.length>64||songChordCount(state)+state.chords.length>MAX_SONG_CHORDS;$('clear-button').disabled=!state.chords.length;$('voice-lead').disabled=state.chords.length<2;
}
function renderInspector(){
 const c=selected();document.querySelectorAll('.editor-fields input,.editor-fields select,.chord-edit-actions button,#preview-selected').forEach(el=>el.disabled=!c);
 $('selected-number').textContent=c?String(state.selected+1).padStart(2,'0'):'—';$('selected-name').textContent=c?chordName(c,state.key):'—';$('selected-notes').textContent=c?notesLabel(c):'コードを選んでください';
 if(c){$('edit-root').value=c.root;$('edit-quality').value=c.quality;$('edit-inversion').value=c.inversion;$('edit-beats').value=c.beats;$('edit-octave').value=c.octave;$('edit-velocity').value=c.velocity;[...$('edit-inversion').options].forEach(o=>o.disabled=Number(o.value)>=QUALITIES[c.quality].intervals.length);}
 $('move-left').disabled=!c||state.selected===0;$('move-right').disabled=!c||state.selected===state.chords.length-1;
 $('edit-voicing').value=c?.voicing||'close';$('edit-bass').value=c?.bass??'';
 const pitches=new Set(c?chordNotes(c,state.settings).map(mod):[]);const whites=[0,2,4,5,7,9,11,12,14,16,17,19,21,23];
 $('mini-keyboard').innerHTML=whites.map(p=>`<button class="piano-white ${pitches.has(mod(p))?'note-on':''}" data-note="${p}" aria-label="${noteLabel(p)}を試聴"><span>${noteLabel(p)}</span></button>`).join('')+[[1,1],[3,2],[6,4],[8,5],[10,6],[13,8],[15,9],[18,11],[20,12],[22,13]].map(([p,b])=>`<button class="piano-black ${pitches.has(mod(p))?'note-on':''}" data-note="${p}" style="left:calc(${b*100/14}% - 2.75%)" aria-label="${noteLabel(p)}を試聴"></button>`).join('');
}
function renderRoll(){
 const total=totalBeats(state.chords);arrangementLength=total;const events=arrangementEvents(state.chords,state.settings).filter(e=>e.track!=='bass');
 $('note-summary').textContent=`${events.length} notes`;
 $('piano-roll').hidden=!rollShown;$('roll-toggle').setAttribute('aria-pressed',rollShown);$('roll-toggle').textContent=rollShown?'構成音を表示':'構成音を非表示';
 const pitches=events.map(e=>e.pitch);const lowest=pitches.length?Math.floor(Math.min(...pitches)/12)*12:48;const highest=Math.max(lowest+23,...pitches);const rows=highest-lowest+1;const width=Math.max(100,(total||16)*4.3);const bb=barBeats();
 const labels=[lowest,lowest+12,...(rows>24?[lowest+24]:[])].filter(p=>p<=highest).map(p=>`<span style="top:${(highest-p)/rows*100}%">${noteLabel(p)}${Math.floor(p/12)-1}</span>`).join('');
 $('piano-roll').innerHTML=`<div class="roll-labels">${labels}</div><div class="roll-inner" style="width:${width}%;--beat-width:${100/(total||16)}%;background-size:100% 100%">${events.map(e=>`<div class="roll-note" title="${esc(noteLabel(e.pitch))} · ${e.durationBeats.toFixed(2)}拍" style="left:${e.startBeat/(total||1)*100}%;width:${e.durationBeats/(total||1)*100}%;top:${(highest-e.pitch)/rows*100}%;height:${100/rows}%;background:${colors[role(state.chords[e.chordIndex]||state.chords[0]||makeChord(0))]}"></div>`).join('')}${Array.from({length:Math.ceil(total/bb)},(_,i)=>`<div class="roll-bar" style="left:${i*bb/(total||1)*100}%"></div>`).join('')}<div class="roll-playhead" id="roll-playhead" hidden></div></div>`;
 $('progression-summary').textContent=state.chords.map(c=>chordName(c,state.key)).join(' → ')||'コードを追加すると、構成音がここに表示されます。';
 const seconds=total*60/state.settings.bpm;$('duration-summary').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
}
function presetCard(p,compact=false){const chords=makePreset(p.id,state.key,p.mode||state.mode,'auto'),d=chords.map(c=>romanNumeral(c,state.key,p.mode||state.mode)).join(' → '),names=chords.map(c=>chordName(c,state.key)).join(' → ');return `<button class="template-card standard-preset" data-preset="${p.id}" aria-label="${esc(p.name)}をキー${esc(KEYS[state.key])}で読み込む"><span class="template-tag">${esc(p.tag)} · KEY ${esc(KEYS[state.key])} Major<span>↗</span></span><strong>${esc(p.name)}</strong><div class="preset-chords">${esc(names)}</div><div class="template-degrees">${esc(d)}</div>${compact?'':`<p>${esc(p.description)}</p>`}</button>`;}
function render(){
 $('project-title').value=state.title;$('key-select').value=state.key;$('mode-select').value=state.mode;
 $('side-key').innerHTML=`${esc(KEYS[state.key])}<small>${{major:'Major',minor:'Minor',dorian:'Dorian',mixolydian:'Mixolydian'}[state.mode]}</small>`;
 $('key-dots').innerHTML=MODES.find(m=>m.id===state.mode).intervals.map(i=>`<span>${esc(noteLabel(i+state.key))}</span>`).join('');
 document.querySelectorAll('[data-ext]').forEach(b=>{b.classList.toggle('active',b.dataset.ext===state.extension);b.setAttribute('aria-pressed',b.dataset.ext===state.extension);});
 $('bpm-input').value=state.settings.bpm;$('meter-select').value=state.settings.meter;$('instrument-select').value=state.settings.instrument;$('pattern-select').value=state.settings.pattern;$('volume-input').value=Math.round(state.settings.volume*100);
 $('loop-button').classList.toggle('active',state.settings.loop);$('loop-button').setAttribute('aria-pressed',state.settings.loop);$('metronome-button').classList.toggle('active',state.settings.metronome);$('metronome-button').setAttribute('aria-pressed',state.settings.metronome);
 const plan=performancePlan(state);$('library-count').textContent=library.length;$('midi-length').textContent=`${state.settings.playScope==='song'?'曲全体':'このセクション'} · ${+(plan.beats/barBeats()).toFixed(1)} bars · ${state.settings.bpm} BPM`;
 document.querySelector('.midi-detail span').textContent=state.settings.bass?'CHORDS + BASS':'CHORDS';
 ['top-export','download-midi'].forEach(id=>$(id).disabled=!plan.chords.length);
 buildPalette();renderSections();renderTimeline();renderInspector();renderRecommendations();renderRoll();prepareMidi();renderRhythm();renderPlayback(0,-1);
 $('compare-progressions').disabled=!state.chords.length||state.chords.every(c=>c.locked);
 $('lock-hint').textContent=`${state.chords.filter(c=>c.locked).length}個を固定中 · 鍵マークで、別案・響き調整から守るコードを選べます。`;
 $('template-cards').innerHTML=NAMED_PRESETS.slice(0,4).map(p=>presetCard(p,true)).join('');
}
function renderPlayback(beat,index){
 const playing=audio.isPlaying;
 const phase=playing?'playing':starting?'starting':'ready';
 if(phase!==transportPhase){
  transportPhase=phase;$('play-button').classList.toggle('playing',playing||starting);
  $('play-button').innerHTML=icon(playing||starting?'stop':'play');
  $('play-button').setAttribute('aria-label',playing?'停止':starting?'再生をキャンセル':'再生');
 }
 $('transport-status').textContent=playing?(auditionLabel?`試聴：${auditionLabel}`:playingSectionId?sectionLabel(state.sections.find(s=>s.id===playingSectionId)||activeSection(state),state.sections):'NOW PLAYING'):starting?'STARTING…':'READY TO PLAY';
 document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('now-playing',playing&&b.dataset.section===playingSectionId));
 document.querySelectorAll('[data-audition-label]').forEach(b=>{const on=(playing||starting)&&auditionLabel===b.dataset.auditionLabel;b.innerHTML=icon(on?'stop':'play')+(on?'停止':'試聴');b.setAttribute('aria-pressed',on);});
 const bb=barBeats(),sub=state.settings.meter===6?.5:1;
 const position=`${String(Math.floor(beat/bb)+1).padStart(2,'0')} <i>:</i> ${Math.floor((beat%bb)/sub)+1}`;
 if($('transport-position').innerHTML!==position)$('transport-position').innerHTML=position;
 const chordIndex=playing?index:-1;
 if(chordIndex!==paintedChord){
  if(timelineNodes[paintedChord]){timelineNodes[paintedChord].el.classList.remove('playing');timelineNodes[paintedChord].dots.forEach(dot=>dot.classList.remove('active'));}
  if(timelineNodes[chordIndex])timelineNodes[chordIndex].el.classList.add('playing');
  paintedChord=chordIndex;paintedStep=-1;
 }
 const item=timelineNodes[chordIndex];
 const offset=playbackPlan?.markers.find(m=>m.sectionId===state.activeSectionId)?.beat||0,localBeat=beat-offset;
 if(item){const step=Math.floor(localBeat-item.start);if(step!==paintedStep){item.dots.forEach((dot,j)=>dot.classList.toggle('active',j<=step));paintedStep=step;}}
 const head=$('roll-playhead');if(head){head.hidden=!playing||!!auditionLabel||(playingSectionId!=null&&playingSectionId!==state.activeSectionId);head.style.left=`${localBeat/(arrangementLength||1)*100}%`;}
 const modalPlay=$('rhythm-play');if(modalPlay){modalPlay.innerHTML=icon(playing||starting?'stop':'play')+(playing||starting?'停止':'この刻みを試聴');modalPlay.setAttribute('aria-label',playing||starting?'リズム試聴を停止':'リズムを試聴');}
}
async function togglePlay(){
 if(audio.isPlaying||starting){stop();return;}const plan=performancePlan(state);if(!plan.chords.length){toast('まずコードを追加してください。');return;}
 playbackPlan=plan;auditionLabel='';
 const request=++playRequest;starting=true;renderPlayback(0,-1);
 try{
  const started=await audio.start(plan.chords,state.settings,{
   onBeat:beat=>{if(request===playRequest)renderPlayback(beat,activeChord);},
   onChord:index=>{if(request!==playRequest)return;const origin=plan.origins[index];playingSectionId=origin?.sectionId;activeChord=origin?.sectionId===state.activeSectionId?origin.index:-1;renderPlayback(audio.currentBeat,activeChord);const el=timelineNodes[activeChord]?.el;if(el){const area=$('chord-timeline');if(el.offsetLeft<area.scrollLeft||el.offsetLeft+el.offsetWidth>area.scrollLeft+area.clientWidth)area.scrollTo({left:el.offsetLeft-10,behavior:'smooth'});}},
   onStop:()=>{if(request!==playRequest)return;starting=false;activeChord=-1;playingSectionId=null;renderPlayback(0,-1);}
  });
  if(request!==playRequest)return;starting=false;if(!started)activeChord=-1;renderPlayback(audio.currentBeat,activeChord);
 }catch(error){if(request!==playRequest)return;stop();toast(error.message||'音声を開始できませんでした。');}
}
async function preview(c){if(!c)return;try{await audio.preview(c,state.settings);}catch(error){toast(error.message||'音声を開始できませんでした。');}}
function addChord(c,at=state.chords.length){if(state.chords.length>=128||songChordCount(state)>=MAX_SONG_CHORDS){toast('1セクションは128コード、曲全体は512コードまでです。');return;}mutate(s=>{const copy={...clone(c),id:makeChord(0).id,beats:barBeats()};s.chords.splice(at,0,copy);s.selected=at;});const el=$('chord-timeline').querySelector(`[data-index="${state.selected}"]`);if(el)$('chord-timeline').scrollTo({left:el.offsetLeft-10,behavior:'smooth'});preview(selected());}
function pickChord(index){state.selected=index;candidateChoice=null;renderInspector();renderRecommendations();document.querySelectorAll('.timeline-chord').forEach((el,i)=>{el.classList.toggle('selected',i===index);el.querySelector('.timeline-select').setAttribute('aria-pressed',i===index);});autosave();}
function removeChord(index=state.selected,{focus=false}={}){
 if(!Number.isInteger(index)||index<0||index>=state.chords.length)return;
 const name=chordName(state.chords[index],state.key);stop();
 mutate(s=>{s.chords.splice(index,1);if(index<s.selected)s.selected--;},{message:`${name}を1個削除しました。元に戻すで復元できます。`});
 if(focus){const next=$('chord-timeline').querySelector(`[data-index="${Math.min(index,state.chords.length-1)}"] .timeline-delete`);(next||$('recommendation-cards').querySelector('.candidate-select'))?.focus({preventScroll:true});}
}
function copyChord(){if(!selected()||state.chords.length>=128||songChordCount(state)>=MAX_SONG_CHORDS)return;mutate(s=>{s.chords.splice(s.selected+1,0,{...clone(selected()),id:makeChord(0).id});s.selected++;},{message:'コードを複製しました'});}
function moveChord(from,to){if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||from>=state.chords.length||to<0||to>=state.chords.length)return;mutate(s=>{const [c]=s.chords.splice(from,1);s.chords.splice(to,0,c);s.selected=to;});toast('コードを移動しました');$('chord-timeline').querySelector(`[data-index="${to}"] .timeline-select`)?.focus({preventScroll:true});}
function setKey(newKey,amount=null){const diff=amount??((newKey-state.key+18)%12-6);if(!diff)return;mutate(s=>{for(const section of s.sections)section.chords=transposeChords(section.id===s.activeSectionId?s.chords:section.chords,diff);s.chords=activeSection(s).chords;s.key=newKey;},{message:`${KEYS[newKey]} ${MODES.find(m=>m.id===state.mode).label}に移調しました`});}
function setMode(newMode){if(newMode===state.mode)return;mutate(s=>{const before=diatonicChords(s.key,s.mode,s.extension),after=diatonicChords(s.key,newMode,s.extension);const convert=c=>{const i=before.findIndex(d=>d.root===c.root&&d.quality===c.quality);return i<0?c:{...c,root:after[i].root,quality:after[i].quality,inversion:Math.min(c.inversion,QUALITIES[after[i].quality].intervals.length-1)};};for(const section of s.sections)section.chords=(section.id===s.activeSectionId?s.chords:section.chords).map(convert);s.chords=activeSection(s).chords;s.mode=newMode;});}
function setExtension(ext){
 if(!['triad','7th','9th'].includes(ext)||ext===state.extension)return;
 state.extension=ext;candidateChoice=null;
 document.querySelectorAll('[data-ext]').forEach(button=>{button.classList.toggle('active',button.dataset.ext===ext);button.setAttribute('aria-pressed',button.dataset.ext===ext);});
 buildPalette();renderRecommendations();autosave();
}
function applyPreset(id){const p=PRESETS.find(x=>x.id===id);if(!p)return;if(songChordCount(state)-state.chords.length+p.degrees.length>MAX_SONG_CHORDS){toast('曲全体は512コードまでです。');return;}mutate(s=>{s.mode=p.mode||s.mode;s.chords=makePreset(id,s.key,s.mode,'auto').map(c=>({...c,beats:barBeats()}));s.selected=0;},{message:`「${p.name}」を読み込みました。元の進行は元に戻せます。`});closeModal();}
function updateSettings(patch,{history=true,restart=true}={}){
 const resume=restart&&(audio.isPlaying||starting);
 mutate(s=>Object.assign(s.settings,patch),{history});audio.setVolume(state.settings.volume);
 if(resume)togglePlay();
}

async function auditionProgression(chords,label){
 if(auditionLabel===label&&(audio.isPlaying||starting)){stop();return;}
 stop();const request=++playRequest;auditionLabel=label;starting=true;renderPlayback(0,-1);
 try{
  const started=await audio.start(chords,{...state.settings,loop:true,metronome:false},{onBeat:beat=>{if(request===playRequest)renderPlayback(beat,-1);},onStop:()=>{if(request!==playRequest)return;starting=false;auditionLabel='';renderPlayback(0,-1);}});
  if(request!==playRequest)return;starting=false;if(!started)auditionLabel='';renderPlayback(0,-1);
 }catch(error){if(request===playRequest){stop();toast(error.message||'試聴を開始できませんでした。');}}
}
function comparisonCard(choice,index,kind='compare'){
 const names=choice.chords.map(c=>chordName(c,state.key)).join(' → ');
 return `<div class="comparison-card"><div><h3>${esc(choice.name)}</h3><p>${esc(choice.description)}</p></div><div class="comparison-chords">${esc(names)}</div><div class="comparison-actions"><button class="button subtle" data-${kind}-play="${index}" data-audition-label="${esc(choice.name)}" aria-pressed="false">${icon('play')}試聴</button><button class="button dark" data-${kind}-apply="${index}">この案を採用</button></div></div>`;
}
function originalComparison(){return `<div class="comparison-original"><div><strong>元の進行</strong><small>${esc(sectionLabel(activeSection(state),state.sections))} · ${state.settings.bpm} BPM · ${esc(PATTERNS.find(p=>p.id===state.settings.pattern).name)}</small></div><button class="button subtle" data-original-play data-audition-label="元の進行" aria-pressed="false">${icon('play')}試聴</button></div>`;}
function openComparison(reset=false){
 stop();if(reset){alternativeRound=0;compareHistory=[];}
 const choices=progressionAlternatives(state.chords,{key:state.key,mode:state.mode,extension:state.extension,loop:state.settings.loop,variation:alternativeRound,exclude:compareHistory});
 if(!choices.length){toast('新しい候補が見つかりませんでした。固定コードを見直すと候補が広がります。');return;}
 compareChoices=choices;compareHistory.push(...choices.map(c=>progressionSignature(c.chords)));
 openModal('別案を聴き比べる',`${originalComparison()}<p class="comparison-note">固定した${state.chords.filter(c=>c.locked).length}コードと、長さ・強弱を維持。同じテンポ・音色・刻みで試聴します。採用するまで元の進行は変わりません。</p><div class="comparison-grid">${compareChoices.map((c,i)=>comparisonCard(c,i)).join('')}</div><button class="button subtle comparison-refresh" data-comparison-refresh>${icon('shuffle')}別の候補を探す</button>`,'KEEP WHAT YOU LOVE','comparison');
}
function openVoicings(){
 stop();if(!state.chords.length)return;
 const descriptions=[['smooth','なめらかにつなぐ','転回形を選び、隣のコードへの音の移動を抑える。'],['top-line','上の音をつなぐ','一番上の音の流れを優先して、響きを整える。'],['bass-line','ベースをつなぐ','コードの構成音から、近いベース音を選ぶ。'],['open','広く響かせる','音をオクターブに広げ、空間のある響きに。'],['drop2','Drop 2で整える','上から2番目の音を下げ、響きに間隔をつくる。']];
 voicingChoices=descriptions.map(([id,name,description])=>({id,name,description,chords:shapeVoicings(state.chords,id)}));
 openModal('響きを整える',`${originalComparison()}<p class="comparison-note">コードの種類・長さ・強弱を維持。鍵マークで固定したコードは動かしません。ベース音はベーストラックに反映します。</p><div class="comparison-grid">${voicingChoices.map((c,i)=>comparisonCard(c,i,'voicing')).join('')}</div>`,'SHAPE YOUR HARMONY','voicing');
}

function openModal(title,body,eyebrow='HARMONY STUDIO',mode=null){
 if(!$('modal').open)lastFocused=document.activeElement;
 modalMode=mode;$('modal').classList.toggle('rhythm-modal',mode==='rhythm');$('modal').classList.toggle('composer-modal',['comparison','voicing'].includes(mode));
 $('modal-title').textContent=title;$('modal-eyebrow').textContent=eyebrow;$('modal-body').innerHTML=body;
 if(!$('modal').open)$('modal').showModal();
}
function closeModal(){if(['rhythm','comparison','voicing'].includes(modalMode))stop();modalMode=null;$('modal').close();lastFocused?.focus?.({preventScroll:true});}
const RHYTHM_LABELS={basic:'基本',simple:'単純系',complex:'複雑系'};
const FEEL_LABELS={pulse:'コードの刻み',groove:'グルーヴ',arp:'アルペジオ'};
function saveRhythmPrefs(){try{localStorage.setItem(STORAGE.picker,JSON.stringify(rhythmPrefs));}catch{}}
function visibleRhythms(){return patternChoices({group:rhythmFilter,feel:rhythmFeel,query:rhythmSearch,favorites:rhythmPrefs.favorites,favoritesOnly:rhythmFavoritesOnly});}
function rhythmSteps(pattern,compact=false){const p=PATTERNS.find(p=>p.id===pattern);return Math.round(barBeats()*(p?.grid||16)/4*(compact?2:1));}
function rhythmStrip(pattern,compact=false){
 const descriptor=PATTERNS.find(p=>p.id===pattern),resolution=(descriptor?.grid||16)/4;
 const beats=barBeats()*(compact?2:1),steps=rhythmSteps(pattern,compact),c=selected()||state.chords[0]||makeChord(state.key,'maj7');
 const hits=arrangementEvents([{...c,beats}],{...state.settings,pattern,humanize:0,swing:0,bass:false});
 const levels=Array(steps).fill(0);for(const e of hits){const i=Math.round(e.startBeat*resolution);if(i>=0&&i<steps)levels[i]=Math.max(levels[i],e.velocity/127);}
 return levels.map((v,i)=>`<i class="${v?'hit ':''}${i%resolution===0?'downbeat ':''}${i===steps/2&&compact?'bar-start':''}" style="--hit:${v.toFixed(2)}" aria-hidden="true"></i>`).join('');
}
function renderRhythm(){
 const pattern=PATTERNS.find(p=>p.id===state.settings.pattern)||BASIC_PATTERNS[0],advanced=pattern.category==='advanced';
 $('next-variation').disabled=!advanced;$('rhythm-count').textContent=`単純 ${SIMPLE_PATTERNS.length} · 複雑 ${COMPLEX_PATTERNS.length}`;
 $('rhythm-name').textContent=pattern.name;$('rhythm-description').textContent=pattern.description;
 $('rhythm-kind').textContent=RHYTHM_LABELS[pattern.complexity];$('rhythm-kind').className=`rhythm-kind ${pattern.complexity}`;
 $('rhythm-strip').innerHTML=rhythmStrip(pattern.id);$('rhythm-strip').style.setProperty('--steps',rhythmSteps(pattern.id));
 $('rhythm-strip').style.gap=pattern.grid>32?'.5px':pattern.grid>=32?'1px':'';
 $('rhythm-summary').textContent=advanced?`VAR ${String(state.settings.variation+1).padStart(2,'0')} · 密度 ${Math.round(state.settings.density*100)}% · アクセント ${Math.round(state.settings.accent*100)}%`:'基本のパターン';
 document.querySelectorAll('[data-quick-pattern]').forEach(button=>{const on=button.dataset.quickPattern===pattern.id;button.classList.toggle('active',on);button.setAttribute('aria-pressed',on);});
 if(modalMode==='rhythm'){
  document.querySelectorAll('[data-rhythm]').forEach(card=>{const on=card.dataset.rhythm===pattern.id;card.classList.toggle('active',on);card.setAttribute('aria-pressed',on);const status=card.querySelector('.rhythm-card-status');if(status)status.innerHTML=on?icon('check')+'選択中':icon('play')+'選ぶ';});
  $('rhythm-selected-name').textContent=pattern.name;$('rhythm-selected-kind').textContent=RHYTHM_LABELS[pattern.complexity];$('rhythm-selected-kind').className=`rhythm-kind ${pattern.complexity}`;
  $('rhythm-selected-description').textContent=pattern.description;
  const variationButton=document.querySelector('[data-rhythm-variation]');if(variationButton)variationButton.disabled=!advanced;
  $('density-label').textContent=pattern.complexity==='simple'?'密度（重ねる音数）':'密度（刻みの数）';
  const note=document.querySelector('.rhythm-settings-note');if(note)note.textContent=!advanced?'高度なパターンを選ぶと、密度・アクセント・バリエーションを調整できます。':pattern.complexity==='simple'?'密度は重ねる音数を調整。一定のタイミングを保ちます。':'密度は刻みの数を調整。細かな連打や休符の入り方を変えられます。';
  for(const key of ['variation','density','accent']){
   const value=key==='variation'?state.settings[key]:Math.round(state.settings[key]*100),input=document.querySelector(`[data-setting="${key}"]`);if(input){input.value=value;input.disabled=!advanced;}
   if($(key+'-value'))$(key+'-value').textContent=key==='variation'?String(value+1).padStart(2,'0'):value+'%';
  }
  $('rhythm-select-hint').textContent=rhythmPrefs.autoplay?'タップで選択・試聴':'タップで選択';updateRhythmNavigation();
 }
}
function updateRhythmNavigation(){
 if(modalMode!=='rhythm')return;const choices=visibleRhythms(),index=choices.findIndex(p=>p.id===state.settings.pattern);
 $('rhythm-previous').disabled=!adjacentPattern(state.settings.pattern,choices,-1);$('rhythm-next').disabled=!adjacentPattern(state.settings.pattern,choices,1);
 $('rhythm-location').textContent=index<0?`${choices.length}候補`: `${index+1} / ${choices.length}`;
}
function renderRhythmCards({scrollToSelection=false}={}){
 const focus=document.activeElement?.closest('[data-rhythm],[data-rhythm-favorite]'),focused=focus?.dataset.rhythm||focus?.dataset.rhythmFavorite,focusFavorite=!!focus?.dataset.rhythmFavorite;
 const focusIndex=[...document.querySelectorAll('[data-rhythm]')].findIndex(card=>card.dataset.rhythm===focused);
 const area=$('rhythm-list'),scroll=area.scrollTop,patterns=visibleRhythms();
 $('rhythm-cards').innerHTML=patterns.length?patterns.map(p=>{
  const chosen=p.id===state.settings.pattern,liked=rhythmPrefs.favorites.includes(p.id);
  return `<article class="rhythm-tile"><button class="rhythm-card ${chosen?'active':''}" data-rhythm="${p.id}" aria-pressed="${chosen}" aria-label="${esc(p.name)}を選択${rhythmPrefs.autoplay?'して試聴':''}"><span class="rhythm-card-top"><span class="rhythm-card-title"><strong>${esc(p.name)}</strong><span class="rhythm-card-meta">${p.complexityLevel===3?'<b class="rhythm-intricate">超複雑</b> · ':''}${FEEL_LABELS[p.feel]} · ${p.grid===32?'32分':p.grid===24||p.grid===48?'連符':p.complexity==='simple'?'一定のリズム':'変則リズム'}</span></span><span class="rhythm-card-status">${icon(chosen?'check':'play')}${chosen?'選択中':'選ぶ'}</span></span><small>${esc(p.description)}</small><span class="rhythm-strip mini" style="--steps:${rhythmSteps(p.id,true)}" aria-hidden="true">${rhythmStrip(p.id,true)}</span></button><button class="rhythm-favorite ${liked?'active':''}" data-rhythm-favorite="${p.id}" aria-pressed="${liked}" aria-label="${esc(p.name)}をお気に入り${liked?'から外す':'に追加'}" title="お気に入り">${liked?'★':'☆'}</button></article>`;
 }).join(''):'<div class="rhythm-empty"><strong>パターンが見つかりません</strong><p>検索や絞り込みを変えてみてください。</p><button class="button" data-rhythm-reset>絞り込みをリセット</button></div>';
 document.querySelectorAll('[data-rhythm-group]').forEach(button=>{const on=button.dataset.rhythmGroup===rhythmFilter;button.classList.toggle('active',on);button.setAttribute('aria-pressed',on);});
 document.querySelectorAll('[data-rhythm-feel]').forEach(button=>{const on=button.dataset.rhythmFeel===rhythmFeel;button.classList.toggle('active',on);button.setAttribute('aria-pressed',on);});
 $('rhythm-favorites-only').classList.toggle('active',rhythmFavoritesOnly);$('rhythm-favorites-only').setAttribute('aria-pressed',rhythmFavoritesOnly);$('rhythm-favorites-count').textContent=rhythmPrefs.favorites.filter(id=>ADVANCED_PATTERNS.find(p=>p.id===id)?.complexity===rhythmFilter).length;
 $('rhythm-results').textContent=`${RHYTHM_LABELS[rhythmFilter]} · ${patterns.length}パターン`;
 area.scrollTop=scroll;if(focused){const attribute=focusFavorite?'data-rhythm-favorite':'data-rhythm',fallback=patterns[Math.max(0,Math.min(focusIndex,patterns.length-1))]?.id;const target=document.querySelector(`[${attribute}="${focused}"]`)||(fallback?document.querySelector(`[${attribute}="${fallback}"]`):$('rhythm-favorites-only'));target?.focus({preventScroll:true});}
 if(scrollToSelection)document.querySelector(`[data-rhythm="${state.settings.pattern}"]`)?.scrollIntoView({block:'nearest'});
 updateRhythmNavigation();
}
function openRhythms(group){
 const current=PATTERNS.find(p=>p.id===state.settings.pattern);rhythmFilter=['simple','complex'].includes(group)?group:current?.complexity==='complex'?'complex':'simple';
 rhythmSearch='';rhythmFeel='all';rhythmFavoritesOnly=false;
 openModal('パターンを選ぶ',`<div class="rhythm-picker">
 <div class="rhythm-type-tabs" role="group" aria-label="刻みの複雑さ"><button data-rhythm-group="simple"><span class="rhythm-type-icon">▥</span><span><strong>単純系 <em>${SIMPLE_PATTERNS.length}</em></strong><small>一定のリズムで刻む</small></span></button><button data-rhythm-group="complex"><span class="rhythm-type-icon">⠿</span><span><strong>複雑系 <em>${COMPLEX_PATTERNS.length}</em></strong><small>細切れ・変則・重なり</small></span></button></div>
 <div class="rhythm-search-row"><label class="sr-only" for="rhythm-search">パターンを検索</label><input id="rhythm-search" type="search" placeholder="名前で検索（ファンク、32分…）" autocomplete="off"><button id="rhythm-favorites-only" class="rhythm-favorites-filter" aria-pressed="false">☆ お気に入り <span id="rhythm-favorites-count">0</span></button></div>
 <div class="rhythm-list-heading"><span id="rhythm-select-hint">タップで選択・試聴</span><span id="rhythm-results"></span></div>
 <div id="rhythm-list" class="rhythm-list"><div id="rhythm-cards" class="rhythm-cards"></div></div>
 <div class="rhythm-picker-footer"><div class="rhythm-now"><div><span id="rhythm-selected-kind" class="rhythm-kind"></span><strong id="rhythm-selected-name"></strong><p id="rhythm-selected-description"></p></div><button id="rhythm-play" class="button dark"></button></div>
 <div class="rhythm-compare"><div class="rhythm-stepper"><button id="rhythm-previous" aria-label="前のパターン" title="前のパターン">←</button><span id="rhythm-location"></span><button id="rhythm-next" aria-label="次のパターン" title="次のパターン">→</button></div><label class="rhythm-auto"><input id="rhythm-auto-audition" type="checkbox" ${rhythmPrefs.autoplay?'checked':''}>選択で試聴</label><button class="text-button" data-rhythm-variation>${icon('shuffle')}別の刻み</button></div>
 <details class="rhythm-adjustments"><summary>細かく調整 <span>密度・アクセント・バリエーション</span></summary><div class="settings-grid rhythm-settings"><label><b id="density-label">密度</b><span id="density-value"></span><input data-setting="density" aria-label="刻みの密度" type="range" min="30" max="100" step="5"></label><label>アクセント <span id="accent-value"></span><input data-setting="accent" aria-label="刻みのアクセント" type="range" min="0" max="100" step="5"></label><label>バリエーション <span id="variation-value"></span><input data-setting="variation" aria-label="刻みのバリエーション" type="range" min="0" max="15" step="1"></label><div class="rhythm-settings-note"></div></div></details></div></div>`, 'RHYTHM LAB · FIND YOUR GROOVE','rhythm');
 renderRhythmCards({scrollToSelection:true});renderRhythm();renderPlayback(audio.currentBeat,activeChord);
}
function choosePattern(id,{audition,scroll=false}={}){
 if(!PATTERNS.some(p=>p.id===id))return;
 const listen=audition??(modalMode==='rhythm'?rhythmPrefs.autoplay:true);
 stop();updateSettings({pattern:id},{restart:false});if(modalMode==='rhythm')renderRhythmCards({scrollToSelection:scroll});if(listen)togglePlay();
}
function stepRhythm(direction){const id=adjacentPattern(state.settings.pattern,visibleRhythms(),direction);if(id)choosePattern(id,{scroll:true});}
function favoriteRhythm(id){if(!ADVANCED_PATTERNS.some(p=>p.id===id))return;const index=rhythmPrefs.favorites.indexOf(id);if(index<0)rhythmPrefs.favorites.push(id);else rhythmPrefs.favorites.splice(index,1);saveRhythmPrefs();renderRhythmCards();}
function nextVariation(){
 if(!ADVANCED_PATTERNS.some(p=>p.id===state.settings.pattern))return;
 const listen=modalMode!=='rhythm'||rhythmPrefs.autoplay||audio.isPlaying||starting;
 stop();updateSettings({variation:(state.settings.variation+1)%16},{restart:false});if(modalMode==='rhythm')renderRhythmCards();if(listen)togglePlay();
}
function openPresets(){openModal('アイデアの種',`<p>有名な進行を、現在のキーで読み込めます。元の進行は「元に戻す」で復元。基本形の響きを保ち、必要に応じてスケールも切り替えます。</p><div class="preset-grid">${NAMED_PRESETS.map(p=>presetCard(p)).join('')}</div>`,'PROGRESSION RECIPES');}
function saveProject(){state.title=$('project-title').value.trim()||'Untitled progression';const entry={...clone(state),savedAt:Date.now()};const next=library.slice(),i=next.findIndex(p=>p.id===state.id);if(i>=0)next[i]=entry;else next.unshift(entry);try{localStorage.setItem(STORAGE.library,JSON.stringify(next));library=next;$('library-count').textContent=library.length;autosave();toast('マイライブラリに保存しました');}catch{toast('保存容量がいっぱいです。JSONを書き出して保存してください。');}}
function openLibrary(){openModal('マイライブラリ',`<div class="library-toolbar"><button class="button" data-library="new">${icon('plus')}新しい進行</button><button class="button" data-library="save">${icon('save')}今の進行を保存</button><button class="button" data-library="json">${icon('download')}JSONを書き出す</button><button class="button" data-library="import">${icon('folder')}JSONを読み込む</button></div><div class="modal-note">進行はこのブラウザに保存されます。別の端末へ移すときはJSONを書き出して読み込んでください。</div><div class="library-list" style="margin-top:16px">${library.length?library.map((p,i)=>`<div class="library-item"><div class="library-info"><strong>${esc(p.title)}</strong><small>${esc(KEYS[p.key]||'C')} · ${esc(p.settings?.bpm||120)} BPM · ${p.sections?.length||1} sections · ${p.sections?.reduce((n,s)=>n+(s.chords?.length||0),0)??p.chords?.length??0} chords · ${new Date(p.savedAt||Date.now()).toLocaleDateString('ja-JP')}</small></div><button class="button" data-load="${i}">開く</button><button class="icon-button" data-remove="${i}" aria-label="${esc(p.title)}を削除">${icon('trash')}</button></div>`).join(''):'<div class="library-empty">気に入った進行を、ここに集めていきましょう。</div>'}</div>`,'YOUR COLLECTION');}
function openSettings(){openModal('演奏・書き出し設定',`<div class="settings-grid"><label>ノートの長さ（100%でつなぐ） <span id="gate-value">${Math.round(state.settings.gate*100)}%</span><input data-setting="gate" type="range" min="10" max="100" value="${state.settings.gate*100}"></label><label>スイング <span id="swing-value">${Math.round(state.settings.swing*100)}%</span><input data-setting="swing" type="range" min="0" max="50" value="${state.settings.swing*100}"></label><label>ヒューマナイズ <span id="humanize-value">${Math.round(state.settings.humanize*100)}%</span><input data-setting="humanize" type="range" min="0" max="100" value="${state.settings.humanize*100}"></label><label>音量 <span id="volume-value">${Math.round(state.settings.volume*100)}%</span><input data-setting="volume" aria-label="試聴の音量" type="range" min="0" max="100" value="${state.settings.volume*100}"></label><label>全体の音域<select data-setting="octave">${[-2,-1,0,1,2].map(n=>`<option value="${n}" ${n===state.settings.octave?'selected':''}>${n===0?'そのまま':(n>0?'+':'')+n+' オクターブ'}</option>`).join('')}</select></label><label class="check-label"><input data-setting="bass" type="checkbox" ${state.settings.bass?'checked':''}>ベースを追加する</label></div><p>ノートの長さ・演奏パターン・スイング・ヒューマナイズ・音域・ベースは、試聴とMIDIの両方に反映されます。</p><div class="settings-footer">MIDIはコードとベースを別トラックにし、テンポ・拍子も含めて書き出します。音色とメトロノームは試聴用です。6/8拍子はBPMを四分音符基準として扱います。</div>`,'MAKE IT FEEL RIGHT');}
function openHelp(){openModal('HARMONYの使い方',`<h3>1. おすすめを聴き比べる</h3><p>キーとスケールを選ぶと候補が切り替わります。Triad・7th・9thは追加する候補の響きです。すでに並べたコードやプリセットはそのまま。候補をタップすると選択・試聴できます。＋を押すか進行へドラッグしたときだけ追加します。数字キー1〜5でおすすめを試聴。「自分でコードを選ぶ」を開くと、キーのコード・借用コード・すべてのコード種別から自由に選べます。開いている間は数字キー1〜7でその一覧を試聴できます。</p><h3>2. おすすめから進行を組み立てる</h3><p>進行のコードを選ぶと、その次のおすすめが5つ表示されます。候補を押して前後のつながりを試聴し、＋で選択コードの直後に追加。「末尾から続ける」で続きを作れます。コードをタップするとエディターで長さ・転回形・音域を変更できます。各コードの「削除」で1個ずつ消し、「元に戻す」で復元できます。ドラッグハンドル「⠿」で並び替え、またはエディターの左右ボタンで移動。「響きを整える」から、転回形・上の音・ベース・広い配置を聴き比べられます。</p><h3>曲の構成と別案</h3><p>「曲の構成」でAメロ / Verse、Bメロ / Pre-Chorus、サビ / Chorusなどを追加し、切り替えて編集します。複製・左右移動・削除にも対応。「このセクション / 曲全体」は再生とMIDI両方の範囲です。キー・拍子・テンポ・刻みは曲全体で共通です。</p><p>コードの鍵マークで、別案と響き調整で固定するコードを指定。「別案を聴き比べる」で、元の進行と3案を同じ条件で試聴できます。採用まで元の進行は変わりません。「響きを整える」では音の配置とベースの流れを比較できます。どの変更も元に戻せます。</p><h3>3. 刻みを試す</h3><p>基本のパターンに加えて「高度なパターン」の単純系で一定の刻み、複雑系で細切れや変則リズムを聴き比べられます。星でお気に入りに保存し、左右のボタンで順番に試せます。密度・アクセント・16通りのバリエーションはMIDIにも反映。「すべての音を停止」は試聴や残響も止めます。</p><h3>4. DAWへ持ち出す</h3><p>パソコンではMIDIカードをDAWへドラッグ。ドラッグの受け取りはブラウザ・OS・DAWの組み合わせによって異なります。対応しない場合は「MIDIを保存」で.midファイルを保存し、DAWへ読み込んでください。スマホは保存、または対応端末の共有ボタンを使えます。</p><div class="modal-note">ブラウザからDAWへの直接ドラッグはChromium系の対応環境向けです。このアプリからDAWの受け取り完了は確認できません。MIDIファイルとしての保存はいつでも使えます。</div><h3>スマホで使う</h3><p>ホーム画面に追加するとアプリのように開けます。初回読み込み後はオフラインでも使えます。進行は端末のブラウザに保存されるため、バックアップはライブラリからJSONを書き出してください。</p>`,'A LITTLE GUIDE');}
function openLearn(){openModal('コードのヒント',`<h3>トニック — 帰ってくる場所</h3><p>Ⅰ・Ⅲ・Ⅵを中心に、落ち着きを感じる響きです。最初や最後のコードに置くと進行がまとまりやすくなります。</p><h3>サブドミナント — 景色を変える</h3><p>Ⅱ・Ⅳを中心に、動きや広がりをつくる響きです。トニックから離れて、次の展開へ向かうときに。</p><h3>ドミナント — 次へ向かう力</h3><p>Ⅴ・Ⅶを中心に、緊張感をつくる響きです。Ⅴ → Ⅰの流れは、帰ってきた感覚を生みます。機能は前後の文脈でも変わります。</p><h3>借用コードで色をつける</h3><p>同じ主音を持つ別のスケールから響きを借ります。CメジャーでFmを使う、など。色分けは目安なので、最後は耳で選んでみてください。</p><h3>転回形でなめらかに</h3><p>一番下の音を変えると、同じコードでも聞こえ方が変わります。コード名の「/E」はEがベースになっている印。「なめらかにつなぐ」で、隣り合うコードの音の動きを整えられます。</p>`,'FOLLOW YOUR EARS');}
function openShortcuts(){openModal('キーボードショートカット',`<div class="shortcut-list"><div><span>再生 / 停止</span><kbd>Space</kbd></div><div><span>元に戻す</span><kbd>⌘ / Ctrl Z</kbd></div><div><span>やり直す</span><kbd>⌘ / Ctrl ⇧ Z</kbd></div><div><span>ライブラリに保存</span><kbd>⌘ / Ctrl S</kbd></div><div><span>選択コードを複製</span><kbd>⌘ / Ctrl D</kbd></div><div><span>選択コードを削除</span><kbd>Delete</kbd></div><div><span>選択コードを移動</span><kbd>← / →</kbd></div><div><span>おすすめを試聴</span><kbd>1 … 5</kbd></div><div><span>自由選択を開いて試聴</span><kbd>1 … 7</kbd></div></div>`,'A FASTER FLOW');}

// Controls and interaction. Every core operation also has a tap or keyboard path.
$('new-section-type').innerHTML=SECTION_TYPES.map(t=>`<option value="${t.id}">${esc(t.ja)} / ${esc(t.en)}</option>`).join('');$('new-section-type').value='chorus';
 $('edit-bass').innerHTML='<option value="">転回形に合わせる</option>'+KEYS.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
 $('section-tabs').onclick=e=>{const b=e.target.closest('[data-section]');if(b&&b.dataset.section!==state.activeSectionId)mutate(s=>activateSection(s,b.dataset.section),{history:false});};
 $('section-tabs').onkeydown=e=>{const button=e.target.closest('[data-section]');if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const current=state.sections.findIndex(s=>s.id===button.dataset.section),next=e.key==='Home'?0:e.key==='End'?state.sections.length-1:Math.min(state.sections.length-1,Math.max(0,current+(e.key==='ArrowLeft'?-1:1)));const id=state.sections[next].id;if(id!==state.activeSectionId)mutate(s=>activateSection(s,id),{history:false});$('section-tabs').querySelector(`[data-section="${id}"]`)?.focus({preventScroll:true});};
 $('add-section').onclick=()=>addSection();$('copy-section').onclick=()=>{addSection(true);document.querySelector('.section-menu').open=false;};$('delete-section').onclick=()=>{deleteSection();document.querySelector('.section-menu').open=false;};$('section-left').onclick=()=>{moveSection(-1);document.querySelector('.section-menu').open=false;};$('section-right').onclick=()=>{moveSection(1);document.querySelector('.section-menu').open=false;};
 document.querySelector('.play-scope').onclick=e=>{const b=e.target.closest('[data-play-scope]');if(b)updateSettings({playScope:b.dataset.playScope});};
 $('recommendation-intent').onchange=e=>{mutate(s=>s.recommendationIntent=e.target.value,{history:false});};
const options=KEYS.map((n,i)=>`<option value="${i}">${n}</option>`).join('');['key-select','edit-root','chromatic-root'].forEach(id=>$(id).innerHTML=options);
const modeLabels={major:'Major / メジャー',minor:'Minor / マイナー',dorian:'Dorian / ドリアン',mixolydian:'Mixolydian'};
 $('pattern-select').innerHTML=`<optgroup label="基本のパターン">${BASIC_PATTERNS.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup><optgroup label="単純系 · 一定のリズム">${SIMPLE_PATTERNS.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup><optgroup label="複雑系 · 変則リズム">${COMPLEX_PATTERNS.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`;
 $('mode-select').innerHTML=MODES.map(m=>`<option value="${m.id}">${modeLabels[m.id]}</option>`).join('');$('edit-quality').innerHTML=Object.entries(QUALITIES).map(([id,q])=>`<option value="${id}">${q.suffix||'maj'} · ${q.label}</option>`).join('');$('edit-octave').innerHTML=Array.from({length:10},(_,i)=>i-1).map(n=>`<option value="${n}">C${n}〜</option>`).join('');
 $('key-select').addEventListener('change',e=>setKey(Number(e.target.value)));$('mode-select').addEventListener('change',e=>setMode(e.target.value));
 $('transpose-down').onclick=()=>setKey(mod(state.key-1),-1);$('transpose-up').onclick=()=>setKey(mod(state.key+1),1);
 $('extension-selector').onclick=e=>{if(e.target.dataset.ext)setExtension(e.target.dataset.ext);};
 document.querySelector('.palette-tabs').onclick=e=>{if(e.target.dataset.tab){paletteTab=e.target.dataset.tab;buildPalette();}};
 $('chromatic-root').onchange=e=>{chromaticRoot=Number(e.target.value);buildPalette();};
 for(const id of ['chord-palette','recommendation-cards']){
  $(id).addEventListener('click',e=>{
   if(Date.now()<suppressCandidateClickUntil)return;
   const card=e.target.closest('.candidate-card'),c=candidateFromCard(card);if(!c)return;
   const action=e.target.closest('[data-candidate-action]')?.dataset.candidateAction;
   if(action==='add')addCandidate(c);else if(action!=='drag')chooseCandidate(c,card.dataset.candidateSource==='recommendation');
  });
  $(id).addEventListener('dragstart',e=>{const card=e.target.closest('.candidate-card'),c=candidateFromCard(card);if(!c)return;e.dataTransfer.setData('application/x-harmony-candidate',JSON.stringify(c));e.dataTransfer.effectAllowed='copy';suppressCandidateClickUntil=Date.now()+500;});
  $(id).addEventListener('dragend',()=>{suppressCandidateClickUntil=Date.now()+500;document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));});
  $(id).addEventListener('pointerdown',e=>{
   if(touchDrag||!e.target.closest('.candidate-grip'))return;
   const card=e.target.closest('.candidate-card'),c=candidateFromCard(card);if(!c)return;
   e.preventDefault();const rect=card.getBoundingClientRect(),ghost=card.cloneNode(true);ghost.classList.add('touch-drag-ghost');ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';document.body.append(ghost);
   touchDrag={kind:'copy',chord:clone(c),to:state.chords.length,valid:false,ghost,dx:e.clientX-rect.left,dy:e.clientY-rect.top,pointer:e.pointerId};e.target.setPointerCapture(e.pointerId);ghost.style.left=e.clientX-touchDrag.dx+'px';ghost.style.top=e.clientY-touchDrag.dy+'px';
  });
 }
 $('continue-last').onclick=()=>pickChord(state.chords.length-1);
 $('chord-timeline').addEventListener('click',e=>{
  if(touchDrag||Date.now()<suppressCandidateClickUntil)return;
  const c=e.target.closest('[data-index]');
  if(c&&e.target.closest('.timeline-lock')){mutate(s=>{s.chords[Number(c.dataset.index)].locked=!s.chords[Number(c.dataset.index)].locked;});return;}
  if(c&&e.target.closest('.timeline-delete')){removeChord(Number(c.dataset.index),{focus:true});return;}
  if(c)pickChord(Number(c.dataset.index));
  if(e.target.closest('.timeline-add')){pickChord(state.chords.length-1);$('recommendation-cards').scrollIntoView({behavior:'smooth',block:'center'});$('recommendation-cards').querySelector('.candidate-select')?.focus({preventScroll:true});}
 });
 $('chord-timeline').addEventListener('dblclick',e=>{if(e.target.closest('.timeline-delete'))return;const c=e.target.closest('[data-index]');if(c)preview(state.chords[Number(c.dataset.index)]);});
 $('chord-timeline').addEventListener('keydown',e=>{
  const c=e.target.closest('[data-index]');if(!c)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();if(!e.repeat)removeChord(Number(c.dataset.index),{focus:true});return;}
  if(e.target.closest('.timeline-delete,.timeline-lock')){e.stopPropagation();return;}
  if(e.key==='Enter'||e.key===' '){pickChord(Number(c.dataset.index));preview(selected());e.preventDefault();e.stopPropagation();}
 });
 $('chord-timeline').addEventListener('dragstart',e=>{if(e.target.closest('.timeline-delete,.timeline-lock')){e.preventDefault();return;}const c=e.target.closest('[data-index]');if(!c)return;dragIndex=Number(c.dataset.index);e.dataTransfer.setData('application/x-harmony-chord',String(dragIndex));e.dataTransfer.effectAllowed='move';requestAnimationFrame(()=>c.classList.add('dragging'));});
 $('chord-timeline').addEventListener('dragover',e=>{if(!Array.from(e.dataTransfer.types).some(t=>t.startsWith('application/x-harmony')))return;e.preventDefault();const c=e.target.closest('[data-index]');document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));c?.classList.add('drop-target');});
 $('chord-timeline').addEventListener('drop',e=>{
  e.preventDefault();const source=e.dataTransfer.getData('application/x-harmony-chord'),payload=e.dataTransfer.getData('application/x-harmony-candidate');const target=e.target.closest('[data-index]');
  if(source!=='')moveChord(Number(source),target?Number(target.dataset.index):state.chords.length-1);
  else if(payload){try{const c=JSON.parse(payload);if(Number.isInteger(c.root)&&c.root>=0&&c.root<12&&Object.hasOwn(QUALITIES,c.quality))addChord(makeChord(c.root,c.quality),target?Number(target.dataset.index):state.chords.length);}catch{}}
  dragIndex=null;document.querySelectorAll('.drop-target,.dragging').forEach(x=>x.classList.remove('drop-target','dragging'));
 });
 $('chord-timeline').addEventListener('dragend',()=>{dragIndex=null;document.querySelectorAll('.drop-target,.dragging').forEach(x=>x.classList.remove('drop-target','dragging'));});
 $('chord-timeline').addEventListener('pointerdown',e=>{if(touchDrag||!e.target.closest('.drag-grip'))return;const card=e.target.closest('[data-index]');if(!card)return;e.preventDefault();const rect=card.getBoundingClientRect(),ghost=card.cloneNode(true);ghost.classList.add('touch-drag-ghost');ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';document.body.append(ghost);touchDrag={kind:'move',from:Number(card.dataset.index),to:Number(card.dataset.index),ghost,dx:e.clientX-rect.left,dy:e.clientY-rect.top,pointer:e.pointerId};e.target.setPointerCapture(e.pointerId);ghost.style.left=e.clientX-touchDrag.dx+'px';ghost.style.top=e.clientY-touchDrag.dy+'px';card.classList.add('dragging');});
 document.addEventListener('pointermove',e=>{
  if(!touchDrag||e.pointerId!==touchDrag.pointer)return;
  touchDrag.ghost.style.left=e.clientX-touchDrag.dx+'px';touchDrag.ghost.style.top=e.clientY-touchDrag.dy+'px';
  const hit=document.elementFromPoint(e.clientX,e.clientY),area=$('chord-timeline'),inside=hit?.closest('#chord-timeline'),target=hit?.closest('#chord-timeline [data-index]');
  document.querySelectorAll('.touch-drop').forEach(x=>x.classList.remove('touch-drop'));area.classList.toggle('candidate-drop-ready',!!inside&&touchDrag.kind==='copy');
  if(touchDrag.kind==='copy'){touchDrag.valid=!!inside;touchDrag.to=target?Number(target.dataset.index):state.chords.length;}
  else if(target)touchDrag.to=Number(target.dataset.index);
  target?.classList.add('touch-drop');
  const r=area.getBoundingClientRect();if(inside){if(e.clientX>r.right-25)area.scrollLeft+=9;if(e.clientX<r.left+25)area.scrollLeft-=9;}
  if(touchDrag.kind==='copy'){if(e.clientY>innerHeight-80)window.scrollBy(0,16);else if(e.clientY<80)window.scrollBy(0,-16);}
 });
 function finishTouch(cancel=false){
  if(!touchDrag)return;const drag=touchDrag;drag.ghost.remove();touchDrag=null;suppressCandidateClickUntil=Date.now()+500;
  document.querySelectorAll('.touch-drop,.dragging,.candidate-drop-ready').forEach(x=>x.classList.remove('touch-drop','dragging','candidate-drop-ready'));
  if(!cancel){if(drag.kind==='copy'&&drag.valid)addChord(drag.chord,drag.to);else if(drag.kind==='move')moveChord(drag.from,drag.to);}
 }
 document.addEventListener('pointerup',e=>{if(e.pointerId===touchDrag?.pointer)finishTouch();});document.addEventListener('pointercancel',e=>{if(e.pointerId===touchDrag?.pointer)finishTouch(true);});
 const editorBindings={'edit-voicing':'voicing','edit-bass':'bass','edit-root':'root','edit-quality':'quality','edit-inversion':'inversion','edit-beats':'beats','edit-octave':'octave','edit-velocity':'velocity'};
 Object.entries(editorBindings).forEach(([id,prop])=>$(id).addEventListener('change',e=>{if(!selected())return;let v=['quality','voicing'].includes(prop)?e.target.value:prop==='bass'&&e.target.value===''?null:Number(e.target.value);if(prop==='velocity')v=Math.round(clamp(v,1,127));mutate(()=>{selected()[prop]=v;if(prop==='quality')selected().inversion=Math.min(selected().inversion,QUALITIES[v].intervals.length-1);});preview(selected());}));
 $('mini-keyboard').onclick=async e=>{const button=e.target.closest('[data-note]');if(!button)return;const pitch=12*((selected()?.octave??4)+1+state.settings.octave)+Number(button.dataset.note);try{await audio.previewNote(pitch,state.settings);}catch(error){toast(error.message||'音声を開始できませんでした。');}};
 $('preview-selected').onclick=()=>preview(selected());$('copy-chord').onclick=copyChord;$('delete-chord').onclick=()=>removeChord();$('move-left').onclick=()=>moveChord(state.selected,state.selected-1);$('move-right').onclick=()=>moveChord(state.selected,state.selected+1);
 $('undo-button').onclick=undo;$('redo-button').onclick=redo;$('clear-button').onclick=()=>mutate(s=>{s.chords=[];s.selected=-1;},{message:'進行をクリアしました。元に戻すで復元できます。'});
 $('duplicate-all').onclick=()=>{if(state.chords.length>64||songChordCount(state)+state.chords.length>MAX_SONG_CHORDS)return;mutate(s=>s.chords.push(...s.chords.map(c=>({...clone(c),id:makeChord(0).id}))),{message:'進行を複製しました'});};
 $('voice-lead').onclick=openVoicings;$('compare-progressions').onclick=()=>openComparison(true);
 $('play-button').onclick=togglePlay;$('stop-button').onclick=stop;$('modal-stop').onclick=stop;['open-rhythms','transport-rhythms'].forEach(id=>$(id).onclick=()=>openRhythms());$('open-simple-rhythms').onclick=()=>openRhythms('simple');$('open-complex-rhythms').onclick=()=>openRhythms('complex');$('next-variation').onclick=nextVariation;document.querySelector('.rhythm-quick').onclick=e=>{const b=e.target.closest('[data-quick-pattern]');if(b)choosePattern(b.dataset.quickPattern);};$('loop-button').onclick=()=>updateSettings({loop:!state.settings.loop});$('metronome-button').onclick=()=>updateSettings({metronome:!state.settings.metronome});
 $('bpm-input').onchange=e=>updateSettings({bpm:Math.round(clamp(e.target.value,40,240))});$('meter-select').onchange=e=>updateSettings({meter:Number(e.target.value)});$('instrument-select').onchange=e=>updateSettings({instrument:e.target.value});$('pattern-select').onchange=e=>updateSettings({pattern:e.target.value});
 $('volume-input').oninput=e=>{state.settings.volume=Number(e.target.value)/100;audio.setVolume(state.settings.volume);autosave();};
 $('roll-toggle').onclick=()=>{rollShown=!rollShown;renderRoll();};$('inspire-button').onclick=()=>{const p=NAMED_PRESETS[Math.floor(Math.random()*NAMED_PRESETS.length)];applyPreset(p.id);};
 $('all-presets').onclick=openPresets;$('template-cards').onclick=e=>{const p=e.target.closest('[data-preset]');if(p)applyPreset(p.dataset.preset);};
 ['top-export','download-midi'].forEach(id=>$(id).onclick=downloadMidi);
 $('midi-drag').onclick=downloadMidi;$('midi-drag').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();downloadMidi();}};
 $('midi-drag').addEventListener('dragstart',e=>{if(!performancePlan(state).chords.length){e.preventDefault();return;}e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('DownloadURL',`audio/midi:${midiFilename}:${midiUri}`);e.dataTransfer.setData('text/uri-list',midiUri);try{e.dataTransfer.items.add(file());}catch{}toast('DAWで受け取れない場合は「MIDIを保存」をお使いください。');});
 $('share-midi').onclick=async()=>{try{await navigator.share({files:[file()],title:state.title});}catch(e){if(e.name!=='AbortError')toast('共有できませんでした。「MIDIを保存」をお使いください。');}};
 ['settings-button','export-options'].forEach(id=>$(id).onclick=openSettings);['nav-library','mobile-library'].forEach(id=>$(id).onclick=openLibrary);$('save-project').onclick=saveProject;
 $('project-title').addEventListener('change',e=>{state.title=e.target.value.trim()||'Untitled progression';e.target.value=state.title;autosave();prepareMidi();});$('project-title').addEventListener('input',e=>{state.title=e.target.value;autosave();prepareMidi();});
 ['help-button'].forEach(id=>$(id).onclick=openHelp);$('nav-learn').onclick=openLearn;$('shortcut-button').onclick=openShortcuts;$('nav-compose').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
 $('close-modal').onclick=closeModal;$('modal').addEventListener('cancel',()=>{if(['rhythm','comparison','voicing'].includes(modalMode))stop();modalMode=null;});$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
 $('modal-body').addEventListener('click',e=>{
  if(e.target.closest('[data-original-play]')){auditionProgression(state.chords,'元の進行');return;}
  if(e.target.closest('[data-comparison-refresh]')){alternativeRound++;openComparison();return;}
  for(const [kind,choices] of [['compare',compareChoices],['voicing',voicingChoices]]){
   const play=e.target.closest(`[data-${kind}-play]`),apply=e.target.closest(`[data-${kind}-apply]`);
   if(play){const choice=choices[Number(play.dataset[kind+'Play'])];if(choice)auditionProgression(choice.chords,choice.name);return;}
   if(apply){const choice=choices[Number(apply.dataset[kind+'Apply'])];if(choice){mutate(s=>s.chords=clone(choice.chords),{message:`「${choice.name}」を採用しました。元に戻すで復元できます。`});closeModal();}return;}
  }

  const rhythm=e.target.closest('[data-rhythm]');if(rhythm){choosePattern(rhythm.dataset.rhythm);return;}
  const group=e.target.closest('[data-rhythm-group]');if(group){rhythmFilter=group.dataset.rhythmGroup;$('rhythm-list').scrollTop=0;renderRhythmCards();return;}
  const feel=e.target.closest('[data-rhythm-feel]');if(feel){rhythmFeel=feel.dataset.rhythmFeel;$('rhythm-list').scrollTop=0;renderRhythmCards();return;}
  const favorite=e.target.closest('[data-rhythm-favorite]');if(favorite){favoriteRhythm(favorite.dataset.rhythmFavorite);return;}
  if(e.target.closest('#rhythm-favorites-only')){rhythmFavoritesOnly=!rhythmFavoritesOnly;$('rhythm-list').scrollTop=0;renderRhythmCards();return;}
  if(e.target.closest('[data-rhythm-reset]')){rhythmSearch='';rhythmFeel='all';rhythmFavoritesOnly=false;$('rhythm-search').value='';renderRhythmCards();$('rhythm-search').focus();return;}
  if(e.target.closest('#rhythm-previous')){stepRhythm(-1);return;}if(e.target.closest('#rhythm-next')){stepRhythm(1);return;}
  if(e.target.closest('#rhythm-play')){togglePlay();return;}if(e.target.closest('[data-rhythm-variation]')){nextVariation();return;}
  const preset=e.target.closest('[data-preset]');if(preset){applyPreset(preset.dataset.preset);return;}
  const load=e.target.closest('[data-load]');if(load){try{const project=validateProject(library[Number(load.dataset.load)]);mutate(()=>{state=project;},{message:'進行を読み込みました'});closeModal();}catch(error){toast(error.message);}return;}
  const remove=e.target.closest('[data-remove]');if(remove){const removed=library.splice(Number(remove.dataset.remove),1);try{localStorage.setItem(STORAGE.library,JSON.stringify(library));}catch{library.push(...removed);toast('ライブラリを更新できませんでした。');return;}$('library-count').textContent=library.length;openLibrary();toast('ライブラリから削除しました');return;}
  const action=e.target.closest('[data-library]')?.dataset.library;
  if(action==='save'){saveProject();openLibrary();}if(action==='new'){mutate(()=>{state=defaults();state.chords=[];state.selected=-1;},{message:'新しい進行を作成しました'});closeModal();}
  if(action==='json'){download(JSON.stringify({...state,app:'HARMONY',version:3},null,2),filename().replace(/\.mid$/,'.harmony.json'),'application/json');toast('プロジェクトのJSONを書き出しました');}if(action==='import')$('project-import').click();
 });
 $('modal-body').addEventListener('input',e=>{if(e.target.id==='rhythm-search'){rhythmSearch=e.target.value;$('rhythm-list').scrollTop=0;renderRhythmCards();return;}const key=e.target.dataset.setting;if(!key||e.target.type!=='range')return;const output=$(key+'-value');if(output)output.textContent=key==='variation'?String(Number(e.target.value)+1).padStart(2,'0'):e.target.value+'%';if(key==='volume'){state.settings.volume=Number(e.target.value)/100;audio.setVolume(state.settings.volume);$('volume-input').value=e.target.value;autosave();}});
 $('modal-body').addEventListener('change',e=>{if(e.target.id==='rhythm-auto-audition'){rhythmPrefs.autoplay=e.target.checked;saveRhythmPrefs();renderRhythmCards();$('rhythm-select-hint').textContent=rhythmPrefs.autoplay?'タップで選択・試聴':'タップで選択';return;}const key=e.target.dataset.setting;if(!key||key==='volume')return;const value=e.target.type==='checkbox'?e.target.checked:['octave','variation'].includes(key)?Number(e.target.value):Number(e.target.value)/100;updateSettings({[key]:value});if(modalMode==='rhythm')renderRhythmCards();});
 $('modal-body').addEventListener('keydown',e=>{if(modalMode!=='rhythm'||!e.target.closest('[data-rhythm]')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const direction=['ArrowRight','ArrowDown'].includes(e.key)?1:-1;stepRhythm(direction);document.querySelector(`[data-rhythm="${state.settings.pattern}"]`)?.focus({preventScroll:true});});
 $('project-import').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>1000000)throw new Error('1MB以下のプロジェクトJSONを選んでください。');const p=validateProject(JSON.parse(await f.text()));p.id=uid();mutate(()=>{state=p;},{message:'プロジェクトを読み込みました'});closeModal();}catch(error){toast(error.message||'ファイルを読み込めませんでした。');}e.target.value='';};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){finishTouch(true);if($('modal').open)closeModal();else stop();e.preventDefault();return;}if($('modal').open)return;const typing=e.target.closest('input,select,textarea,[contenteditable=true]');const command=e.metaKey||e.ctrlKey;if(command&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();return;}if(typing)return;if(e.target.closest('.song-builder')&&['ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key))return;if(command&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if(command&&e.key.toLowerCase()==='d'){e.preventDefault();copyChord();return;}if(e.code==='Space'){if(e.repeat){e.preventDefault();return;}if(e.target.closest('button,a,summary,[role=button]'))return;e.preventDefault();togglePlay();return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeChord();return;}if(e.key==='ArrowLeft'){e.preventDefault();moveChord(state.selected,state.selected-1);}if(e.key==='ArrowRight'){e.preventDefault();moveChord(state.selected,state.selected+1);}if(/^[1-7]$/.test(e.key)){const manual=$('manual-chords').open,c=manual?palette[Number(e.key)-1]:recommendations[Number(e.key)-1]?.chord;if(c){e.preventDefault();chooseCandidate(c,!manual);}}});
 window.addEventListener('pagehide',()=>{stop();try{localStorage.setItem(STORAGE.draft,JSON.stringify(state));}catch{}});
 render();audio.setVolume(state.settings.volume);autosave();
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
