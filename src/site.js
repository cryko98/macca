// Site settings: fill these in when they are ready, nothing else needs to change.
export const SITE = {
  ca: 'GAGDqXtsZyEb3meqYDVfZ61bpbeCmhQJpxXffhkapump', // contract address (empty = "COMING SOON")
  telegram: 'https://t.me/maccathegtagator', // Telegram group (empty = "soon")
};

export const DISCLAIMER =
  'Unofficial fan-made project. Not affiliated with, endorsed, sponsored or approved by Rockstar Games or Take-Two Interactive. ' +
  'Grand Theft Auto, GTA, Vice City, Leonida and Macca the Gator are trademarks or properties of their respective owners. ' +
  'The 3D models, art, code and music here were made for this project. Nothing on this site is financial advice; crypto is risky.';

const LORE = [
  ['Hatched in neon', `Nobody in Leonida remembers exactly when the pink egg washed up under the Sol Pier. The fishermen swear it glowed like the ferris wheel at night. What crawled out was small, very pink, and already wearing sunglasses. The townsfolk named him <b>Macca</b>, and the beach never really recovered.`],
  ['The Gator Bar', `Macca grew up on the boardwalk, learning two things: how to swim faster than the lifeguards and how to mix a martini without spilling a drop, even in the surf. When the old tiki shack on Ocean Drive went up for sale, he paid in sand dollars and charm. Today the <b>Gator Bar</b> is the pinkest building on the coast, and Macca is behind the counter, Hawaiian shirt open, glass always full.`],
  ['Flo, the town and the trouble', `<b>Flo</b> runs the party side of things and runs Macca too, mostly. Leonida loves him: the valets at the Flamingo Hotel, the cooks at Rosa's Diner, the kids who chase his wake at the beach. The <b>Croc Brothers</b> don't. They want the coast for themselves, and they don't like pink.`],
  ['The Beach Party', `Once a year Leonida throws the biggest beach party on the coast, and this year it's Macca's. The bar is dry, the cops are jumpy and the Croc Brothers are tearing down the posters. Six jobs stand between Macca and the best night the town has ever seen. Grab a car, keep the martini upright, and make it legendary.`],
];

const TG_SVG = `<svg viewBox="0 0 240 240" width="22" height="22" aria-hidden="true"><circle cx="120" cy="120" r="120" fill="#29a9eb"/><path fill="#fff" d="M54 117l117-45c5-2 10 1 8 9l-20 94c-1 6-5 8-10 5l-29-21-14 13c-2 2-3 3-6 3l2-30 55-50c2-2 0-3-3-1l-68 43-29-9c-6-2-6-6 1-9z"/></svg>`;

export function initSite(G) {
  const $ = (id) => document.getElementById(id);
  // contract address
  const caText = $('ca-text'), caBtn = $('ca-copy');
  if (SITE.ca) {
    caText.textContent = SITE.ca;
    caText.classList.remove('soon');
    caBtn.disabled = false;
    caBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(SITE.ca);
        caBtn.textContent = 'COPIED!';
      } catch {
        caBtn.textContent = 'SELECT + COPY';
      }
      setTimeout(() => (caBtn.textContent = 'COPY'), 1600);
    };
  } else {
    caText.textContent = 'COMING SOON';
    caText.classList.add('soon');
    caBtn.disabled = true;
  }
  // telegram
  for (const a of document.querySelectorAll('.tg-link')) {
    a.innerHTML = TG_SVG + `<span>${SITE.telegram ? 'Telegram' : 'Telegram · soon'}</span>`;
    if (SITE.telegram) {
      a.href = SITE.telegram;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.classList.remove('soon');
    } else {
      a.removeAttribute('href');
      a.classList.add('soon');
      a.onclick = () => G.hud?.toast?.('Telegram link coming soon!', 2);
    }
  }
  // disclaimers
  for (const el of document.querySelectorAll('.disclaimer')) el.textContent = DISCLAIMER;
  // lore
  $('lore-body').innerHTML = LORE.map(([h, p], i) => `<section><h3><span>${String(i + 1).padStart(2, '0')}</span>${h}</h3><p>${p}</p></section>`).join('');
  const lore = $('lore');
  const open = (v) => lore.classList.toggle('show', v);
  $('lorebtn').onclick = () => open(true);
  $('lore-close').onclick = () => open(false);
  lore.addEventListener('click', (e) => e.target === lore && open(false));
  addEventListener('keydown', (e) => e.code === 'Escape' && lore.classList.contains('show') && open(false));
  G.openLore = () => open(true);
}

// fill the disclaimers right away (the loading screen shows one too)
for (const el of document.querySelectorAll('.disclaimer')) el.textContent = DISCLAIMER;
