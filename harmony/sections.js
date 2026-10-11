import {makeChord, totalBeats} from './music.js?v=2.0.0';

export const SECTION_TYPES = [
  {id:'intro', ja:'イントロ', en:'Intro'},
  {id:'verse', ja:'Aメロ', en:'Verse'},
  {id:'prechorus', ja:'Bメロ', en:'Pre-Chorus'},
  {id:'chorus', ja:'サビ', en:'Chorus'},
  {id:'interlude', ja:'間奏', en:'Interlude'},
  {id:'bridge', ja:'ブリッジ', en:'Bridge'},
  {id:'outro', ja:'アウトロ', en:'Outro'},
];
export const MAX_SECTIONS = 12;
export const MAX_SONG_CHORDS = 512;
const uid = () => globalThis.crypto?.randomUUID?.() ?? `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const sectionType = type => SECTION_TYPES.find(s=>s.id===type) || SECTION_TYPES[1];
export function sectionLabel(section, sections=[]) {
  const type=sectionType(section.type), peers=sections.filter(s=>s.type===section.type);
  const number=peers.length>1 ? ` ${peers.findIndex(s=>s.id===section.id)+1}` : '';
  return `${type.ja}${number} / ${type.en}${number}`;
}
export function createSection(type='verse', chords=[]) {
  return {id:uid(), type:sectionType(type).id, selected:chords.length?0:-1, chords};
}
export const activeSection = project => project.sections.find(s=>s.id===project.activeSectionId) || project.sections[0];
export function syncSection(project) {
  const section=activeSection(project);
  section.chords=project.chords;
  section.selected=project.selected;
  return section;
}
export function activateSection(project,id) {
  syncSection(project);
  const section=project.sections.find(s=>s.id===id);
  if(!section)return;
  project.activeSectionId=id; project.chords=section.chords; project.selected=section.selected;
}
export function duplicateSection(section) {
  return createSection(section.type,section.chords.map(c=>({...c,id:makeChord(0).id})));
}
export function songChordCount(project) {
  return project.sections.reduce((count,s)=>count+(s.id===project.activeSectionId?project.chords:s.chords).length,0);
}
/** Same flattened sequence and marker positions for playback and MIDI. */
export function performancePlan(project, scope=project.settings.playScope) {
  const sections=scope==='song'?project.sections:[activeSection(project)];
  const chords=[], origins=[], markers=[];
  let beat=0;
  for(const section of sections){
    const sequence=section.id===project.activeSectionId?project.chords:section.chords;
    if(!sequence.length)continue;
    const label=sectionLabel(section,project.sections), start=beat;
    const type=sectionType(section.type),number=project.sections.filter(s=>s.type===section.type).length>1?' '+(project.sections.filter(s=>s.type===section.type).findIndex(s=>s.id===section.id)+1):'';
    const roman={verse:'A-melo',prechorus:'B-melo',chorus:'Sabi'}[section.type];
    markers.push({beat,label,midiLabel:type.en+number+(roman?' / '+roman+number:''),sectionId:section.id});
    sequence.forEach((chord,index)=>{chords.push(chord);origins.push({sectionId:section.id,index,start,label});});
    beat+=totalBeats(sequence);
  }
  return {chords,origins,markers,beats:beat};
}
