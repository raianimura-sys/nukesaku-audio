// Motion Reference: fade/slide, FLIP rearrangement, accordion and press feedback.
// Presentation only: edits, sound, saving and exports never wait for animation.
const EASE='cubic-bezier(.22,1,.36,1)';
const cards=area=>[...area.querySelectorAll('[data-motion-key]')];

export function createMotion(doc,win) {
  const preference=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const animations=new Set(),disclosures=new Map(),lists=new WeakMap();
  const enabled=()=>!preference?.matches&&!doc.hidden;
  const cancel=animation=>{try{animation.cancel();}catch{}animations.delete(animation);};
  function animate(element,frames,options={}) {
    if(!enabled()||!element?.animate)return null;
    try {
      const animation=element.animate(frames,{duration:240,easing:EASE,...options});
      animations.add(animation);
      animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));
      return animation;
    } catch {return null;}
  }
  function visible(element,area) {
    const r=element.getBoundingClientRect(),a=area.getBoundingClientRect();
    return r.right>a.left&&r.left<a.right&&r.bottom>0&&r.top<win.innerHeight;
  }
  function captureTimeline(area) {
    const a=area.getBoundingClientRect(),items=new Map();
    for(const el of cards(area)) {
      const r=el.getBoundingClientRect();
      items.set(el.dataset.motionKey,{x:r.left-a.left+area.scrollLeft,y:r.top-a.top});
      // Read the current visual position before cancelling an interrupted move.
      for(const animation of el.getAnimations?.()||[])cancel(animation);
    }
    return {context:area.dataset.motionContext,items};
  }
  function timeline(area,before,context) {
    area.dataset.motionContext=context;
    if(!enabled())return;
    const a=area.getBoundingClientRect(),same=before.context===context;
    cards(area).filter(el=>visible(el,area)).slice(0,20).forEach((el,index)=>{
      const r=el.getBoundingClientRect(),old=same&&before.items.get(el.dataset.motionKey);
      if(old) {
        const dx=old.x-(r.left-a.left+area.scrollLeft),dy=old.y-(r.top-a.top);
        if(Math.abs(dx)+Math.abs(dy)>.5)animate(el,[{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:280});
      } else animate(el,[{opacity:.25,transform:'translateY(7px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:240,delay:same?0:Math.min(index*22,88)});
    });
  }
  function revealList(area,signature) {
    if(lists.get(area)===signature)return;
    lists.set(area,signature);
    [...area.children].filter(el=>visible(el,area)).slice(0,12).forEach((el,i)=>
      animate(el,[{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,delay:Math.min(i*22,88)}));
  }
  function settleDisclosure(detail,record) {
    if(disclosures.get(detail)!==record)return;
    detail.open=record.open;
    detail.style.removeProperty('height');detail.style.removeProperty('overflow');
    detail.removeAttribute('data-motion-closing');
    detail.querySelector('summary')?.setAttribute('aria-expanded',String(record.open));
    disclosures.delete(detail);
  }
  function toggleDisclosure(detail) {
    const previous=disclosures.get(detail),open=!(previous?.open??detail.open);
    const from=detail.getBoundingClientRect().height;
    if(previous)cancel(previous.animation);
    detail.style.removeProperty('height');detail.style.removeProperty('overflow');
    detail.open=open;const to=detail.getBoundingClientRect().height;
    detail.querySelector('summary')?.setAttribute('aria-expanded',String(open));
    if(!enabled()||!detail.animate||Math.abs(from-to)<1) {disclosures.delete(detail);detail.removeAttribute('data-motion-closing');return;}
    detail.open=true;detail.style.height=to+'px';detail.style.overflow='clip';
    detail.toggleAttribute('data-motion-closing',!open);
    const record={open,animation:null};disclosures.set(detail,record);
    record.animation=animate(detail,[{height:from+'px'},{height:to+'px'}],{duration:open?260:190});
    if(record.animation)record.animation.finished.then(()=>settleDisclosure(detail,record),()=>settleDisclosure(detail,record));
    else settleDisclosure(detail,record);
  }
  function finish() {
    for(const [detail,record] of disclosures)settleDisclosure(detail,record);
    for(const animation of animations)cancel(animation);
  }
  function onClick(event) {
    if(event.defaultPrevented||event.button>0)return;
    const summary=event.target.closest?.('summary'),detail=summary?.parentElement;
    if(!detail?.matches('details.manual-chords,details.rhythm-adjustments,details.library-recovery'))return;
    event.preventDefault();toggleDisclosure(detail);
  }
  function onPreference(){if(preference.matches)finish();}
  function onVisibility(){if(doc.hidden)finish();}
  doc.addEventListener('click',onClick);
  doc.addEventListener('visibilitychange',onVisibility);
  preference?.addEventListener?.('change',onPreference);
  doc.documentElement.classList.add('motion-ready');
  return {
    captureTimeline,timeline,revealList,toggleDisclosure,
    modal:element=>animate(element,[{opacity:.2,transform:'translateY(10px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:210}),
    get scrollBehavior(){return preference?.matches?'auto':'smooth';},
    destroy(){finish();doc.removeEventListener('click',onClick);doc.removeEventListener('visibilitychange',onVisibility);preference?.removeEventListener?.('change',onPreference);doc.documentElement.classList.remove('motion-ready');},
  };
}
