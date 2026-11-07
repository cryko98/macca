// The help panel: controls, missions (with status), places on the map, side activities, graphics.
import { touchText } from './touch.js';

const $ = (id) => document.getElementById(id);
const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ');

const PLACES = [
  ['#ffd84a', 'GATOR BAR', 'South-west, on the beach road', "Macca's bar. The yellow beam at its door starts the story missions. Buy cocktails here (E)."],
  ['#ff4fa6', "MACCA'S GARAGE", 'West, behind the shops', 'Where stolen cars are delivered (Pink Pearl).'],
  ['#ff6fae', 'FLAMINGO HOTEL', 'South centre, the tall pink tower', 'The valet parks the pink supercar here.'],
  ['#3fe0ff', 'SURF SHACK · 24/7 · PAWN', 'West block, facing the main street', 'The shopping street.'],
  ['#ffb020', "SOL GAS · ROSA'S DINER", 'North centre', 'Gas station under the lit canopy and a 50s diner.'],
  ['#4fb8ff', 'POLICE STATION', 'North-west', 'Two cruisers are parked in the lot. Stealing one brings stars!'],
  ['#ff3b4d', 'CLINIC', 'North-west, next to the police', 'You wake up here after WASTED (-$100).'],
  ['#ff7a3c', 'SOL MOTEL', 'East, with the pool and the pole sign', 'Parked cars in the courtyard.'],
  ['#ffffff', 'TOWN SQUARE', 'The centre', 'Fountain, bandstand, clock tower and the LEONIDA sign.'],
  ['#3fe0ff', 'SOL PIER', 'South, out over the sea', 'Ferris wheel and the dancing crowd. Finale of the story.'],
  ['#ffd400', 'STUNT RAMP', 'Beach, west of the pier', 'Hit it fast in a car for a stunt bonus.'],
  ['#ffd84a', 'TIKI HUT', 'On the beach', 'Beach bar: cocktails (E).'],
  ['#ffffff', 'LIGHTHOUSE', 'On the rocks off the south-east coast', 'Swim out to it.'],
  ['#ffffff', 'LEONIDA SIGN', 'On the hill north of town', 'Big white letters with a view over the bay.'],
];

export class Help {
  constructor(G) {
    this.G = G;
    this.el = $('help');
    this.open = false;
    $('helpbtn').onclick = () => this.toggle();
    $('help-close').onclick = () => this.toggle(false);
    $('titlehelp').onclick = () => this.toggle(true);
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F1') {
        e.preventDefault();
        if (['play', 'help', 'title'].includes(G.state) || this.open) this.toggle();
      } else if (e.code === 'Escape' && this.open) this.toggle(false);
    });
    this.el.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) {
        G.setQuality(q.dataset.q);
        this.render();
      }
    });
  }

  toggle(force) {
    const G = this.G;
    const open = force ?? !this.open;
    if (open === this.open) return;
    this.open = open;
    if (open) {
      this.prev = G.state;
      if (G.state === 'play') G.state = 'help';
      document.exitPointerLock?.();
      this.render();
      this.el.classList.add('show');
    } else {
      this.el.classList.remove('show');
      if (G.state === 'help') G.state = this.prev === 'play' ? 'play' : G.state;
    }
  }

  render() {
    const G = this.G, M = G.missions;
    const missions = M.missions
      .map((m, i) => {
        const done = i < M.done, next = i === M.done, active = M.active?.def === m;
        const status = active ? '<b class="st act">IN PROGRESS</b>' : done ? '<b class="st ok">✔ PASSED</b>' : next ? '<b class="st next">▶ NEXT</b>' : '<b class="st lock">LOCKED</b>';
        return `<div class="mission ${done ? 'done' : ''} ${next ? 'next' : ''}"><div class="mh"><span>${i + 1}. ${m.title}</span>${status}<span class="rw">$${m.reward}</span></div><p>${m.desc || ''}</p></div>`;
      })
      .join('');
    const places = PLACES.map(([c, n, where, what]) => `<li><i style="background:${c}"></i><b>${n}</b> <span class="where">${where}</span><br>${what}</li>`).join('');
    const q = (x) => `<button class="qbtn ${G.quality === x ? 'on' : ''}" data-q="${x}">${x}</button>`;
    $('help-body').innerHTML = `
      ${G.touch?.on ? `<details open><summary>🎮 Touch controls</summary>
        <div class="cols">
          <div><h4>On foot</h4>
            <p><b>Left thumb</b>: touch anywhere on the left and slide: a joystick appears. Push it all the way to run (it turns pink).</p>
            <p>${k('BITE')} bite + tail whip · ${k('JUMP')} jump · ${k('DANCE')} dance</p>
            <p>${k('CAR')} get in or jack a car: it glows gold when one is close enough</p>
            <p>${k('USE')} sip a cocktail (+35 health), or buy a refill when it glows</p>
            <p>Swim: just walk into the sea</p></div>
          <div><h4>In a car</h4>
            <p>Steer with the joystick; push it up or down to drive without buttons</p>
            <p>${k('GAS')} ${k('BRAKE')} (reverse when stopped) · ${k('DRIFT')} handbrake</p>
            <p>${k('NITRO')} boost · ${k('HORN')} · ${k('EXIT')} get out</p></div>
          <div><h4>Camera &amp; menus</h4>
            <p><b>Right thumb</b>: drag to look around, pinch with two fingers to zoom. The camera also follows Macca by itself.</p>
            <p>${k('MAP')} big map · ${k('&#9835;')} radio · ${k('II')} pause (right edge)</p>
            <p>${k('?')} this help · tap the story text to move it on</p></div>
        </div>
      </details>` : ''}
      <details ${G.touch?.on ? '' : 'open'}><summary>🎮 ${G.touch?.on ? 'Keyboard controls' : 'Controls'}</summary>
        <div class="cols">
          <div><h4>On foot</h4>
            <p>${k('W', 'A', 'S', 'D')} or arrows: walk (the camera follows Macca)</p>
            <p>${k('Shift')} run · ${k('Space')} jump</p>
            <p>${k('Click')} / ${k('K')} bite + tail whip</p>
            <p>${k('E')} sip a cocktail (+35 health, 3 per refill)</p>
            <p>${k('X')} dance · ${k('F')} get in / jack a car</p>
            <p>Swim: just walk into the sea</p></div>
          <div><h4>In a car</h4>
            <p>${k('W')} gas · ${k('S')} brake / reverse</p>
            <p>${k('A')} ${k('D')} steer · ${k('Space')} handbrake (drift)</p>
            <p>${k('Shift')} nitro · ${k('H')} horn</p>
            <p>${k('F')} get out (at speed: dive out!)</p>
            <p>${k('G')} siren in a police car</p></div>
          <div><h4>General</h4>
            <p>${k('Mouse')} look (click the game to lock the mouse) or drag to look</p>
            <p>${k('Wheel')} zoom · ${k('M')} big map</p>
            <p>${k('R')} radio on / off · ${k('P')} graphics quality</p>
            <p>${k('Tab')} / ${k('?')} this help · ${k('Esc')} pause</p></div>
        </div>
      </details>
      <details open><summary>⭐ Missions · ${M.done}/${M.missions.length} passed</summary>
        <p class="lead">Start the next mission by walking into the <b style="color:var(--gold)">yellow beam</b> at the <b>GATOR BAR</b> door (beach road, south-west; the yellow <b>G</b> on the minimap). You can't start one while the cops are after you. The pink marker and the pink GPS line on the minimap show where to go.</p>
        ${missions}
      </details>
      <details><summary>🗺️ Map &amp; places</summary>
        <div class="mapwrap"><canvas id="helpmap" width="520" height="520"></canvas><ul class="places">${places}</ul></div>
      </details>
      <details><summary>🌴 Side activities</summary>
        <ul class="side">
          <li><b>Hidden flamingos</b> (${M.flamingosFound.size}/10 found): pink glowing statues all over town, on the pier, the lighthouse rocks and the hill. $100 each, $1000 for all ten.</li>
          <li><b>Stunt jumps</b>: the yellow-black ramp on the beach. The longer the airtime, the bigger the bonus.</li>
          <li><b>Cash</b>: people sometimes drop money when Macca bites them (green bills, walk over them).</li>
          <li><b>Cocktails</b>: refill 3 for $20 at the Gator Bar door or the TIKI hut (E). Each sip heals.</li>
        </ul>
      </details>
      <details><summary>🚨 Police, BUSTED &amp; WASTED</summary>
        <ul class="side">
          <li>Biting people, running them over and stealing cars (when someone sees it) raise your <b>wanted stars</b>. Anything done to a cop counts double.</li>
          <li>More stars, more police cars. From <b>3 stars</b> a helicopter follows you with a searchlight.</li>
          <li>Get out of sight: when the stars <b>blink</b>, nobody sees you; keep hiding until they go out.</li>
          <li>If officers hold you, or box your stopped car in: <b>BUSTED</b> (-$200, back at the police station).</li>
          <li>If your health runs out: <b>WASTED</b> (-$100, back at the clinic). A failed mission can be started again at the bar.</li>
        </ul>
      </details>
      <details><summary>📜 About · Lore · Disclaimer</summary>
        <p class="lead"><button class="qbtn" onclick="G.openLore()">READ THE LORE</button></p>
        <p class="lead" style="font-size:12px;opacity:.75">Unofficial fan-made project. Not affiliated with, endorsed, sponsored or approved by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA, Vice City, Leonida and Macca the Gator are trademarks or properties of their respective owners.</p>
      </details>
      <details><summary>🖥️ Graphics</summary>
        <p class="lead">${q('LOW')} ${q('HIGH')} ${q('ULTRA')}</p>
        <p class="lead">LOW: for weaker computers. HIGH: sharp HD with anti-aliasing. ULTRA: HIGH + 4K shadows and soft contact shadows (ambient occlusion), needs a good graphics card. If the game runs slowly it steps down by itself until you pick a level here. Key ${k('P')} cycles them.</p>
      </details>`;
    if (G.touch?.on) {
      // a phone never hears about keys: drop the keyboard section, name the buttons instead
      const body = $('help-body');
      for (const d of body.querySelectorAll('details')) if (/Keyboard controls/.test(d.querySelector('summary').textContent)) d.remove();
      body.innerHTML = touchText(body.innerHTML);
    }
    const cv = $('helpmap');
    if (cv) G.hud.drawBigMap(cv, false);
  }
}
