import { B } from './world.js';
import { GY } from './city.js';
import { $ } from './util.js';
import { drawPortrait } from './portraits.js';
import { CAR_TYPES } from './cars.js';

// Buildings that do something. Staff turn up for work when you come near
// (see county.js for where everything is): talk to them with E for a menu.
//
//   Hospitals   heal you, and you wake up in one of their beds
//   Police      pay your fine, turn yourself in, go on patrol; and the cells
//   School      take a class (a quiz) for coins, school lunch
//   Library     the book club quiz and things to read
//   Food        pizza, burgers, coffee, ice cream... heal you or power you up
//   Shops       gun shop (the Armory), clothes and pets (Style and skins)
//   Bank        keep your coins safe: they earn interest every night
//   Gym         work out for a power-up
//   Dealer      buy cars, including the Hyper Car
//   Hotel/home  sleep till morning

const FOODS = {
  pizza: [['Slice of pizza', 8, { heal: 6 }], ['Whole pizza', 20, { heal: 20 }], ['Garlic bread', 5, { heal: 3 }]],
  burger: [['Cheeseburger', 10, { heal: 8 }], ['Mega Block Burger', 25, { heal: 20, buff: 'dmg' }], ['Milkshake', 8, { buff: 'speed' }]],
  coffee: [['Hot chocolate', 6, { heal: 4 }], ['Triple espresso', 8, { buff: 'rapid' }], ['Muffin', 6, { heal: 5 }]],
  icecream: [['Ice cream cone', 5, { heal: 4 }], ['Giant sundae', 15, { heal: 12, buff: 'speed' }]],
  taco: [['Taco', 6, { heal: 5 }], ['Extra spicy taco', 12, { heal: 6, buff: 'dmg' }]],
  sushi: [['Sushi roll', 10, { heal: 8 }], ['Sushi platter', 22, { heal: 20 }]],
  bakery: [['Cupcake', 5, { heal: 4 }], ['Chocolate cake', 12, { heal: 12 }]],
  donut: [['Donut', 4, { heal: 3 }], ['Box of donuts', 18, { heal: 16 }]],
  fish: [['Fish and chips', 12, { heal: 12 }], ['Crab sandwich', 9, { heal: 8 }]],
  snack: [['Snack', 5, { heal: 4 }]],
};
const MART = [['Sandwich', 8, { heal: 8 }], ['Energy drink', 12, { buff: 'speed' }], ['Bandages', 10, { heal: 6 }], ['First aid kit', 30, { heal: 20 }]];

// Cars at Wheels & Deals.
export const FOR_SALE = [
  ['sedan', 300],
  ['taxi', 400],
  ['pickup', 500],
  ['suv', 600],
  ['sports', 900],
  ['icecream', 900],
  ['bus', 1200],
  ['monster', 3000],
  ['super', 5000],
];

// Questions for the school and the book club.
const TRIVIA = [
  ['What do bees make?', 'Honey', 'Milk', 'Bread'],
  ['How many legs does a spider have?', '8', '6', '10'],
  ['Which planet do we live on?', 'Earth', 'Mars', 'Jupiter'],
  ['Mix blue and yellow paint. What colour do you get?', 'Green', 'Purple', 'Orange'],
  ['What is the biggest animal ever?', 'The blue whale', 'The elephant', 'The giraffe'],
  ['What is frozen water called?', 'Ice', 'Steam', 'Sand'],
  ['How many days are in a week?', '7', '5', '10'],
  ['What is the capital city of France?', 'Paris', 'London', 'Rome'],
  ['Which of these is a mammal?', 'A dolphin', 'A shark', 'A trout'],
  ['What do plants need to make their food?', 'Sunlight', 'Moonlight', 'Candy'],
  ['How many sides does a triangle have?', '3', '4', '5'],
  ['Which gas do we breathe in to live?', 'Oxygen', 'Helium', 'Smoke'],
  ['Where does the sun rise?', 'In the east', 'In the west', 'In the north'],
  ['What is the biggest ocean?', 'The Pacific', 'The Atlantic', 'The Indian'],
  ['How many minutes are in an hour?', '60', '100', '30'],
  ['Which word is spelled right?', 'Because', 'Becuase', 'Becaus'],
  ['What is the opposite of "ancient"?', 'Modern', 'Old', 'Dusty'],
  ['What is a baby frog called?', 'A tadpole', 'A kitten', 'A cub'],
  ['Which is the hottest planet?', 'Venus', 'Neptune', 'Pluto'],
  ['What makes a rainbow?', 'Sunlight and rain', 'Paint', 'Clouds only'],
  ['How many continents are there?', '7', '5', '12'],
  ['What is 1 hour and 30 minutes in minutes?', '90', '130', '60'],
  ['Which animal can change colour to hide?', 'A chameleon', 'A cow', 'A penguin'],
  ['What do you call a shape with 8 sides?', 'An octagon', 'A hexagon', 'A pentagon'],
  ['What number do people in Blockton dial for the police?', '5-0-5-0', '1-2-3', '0-0-0'],
  ['Who runs the pizza shop in Blockton?', 'Tony', 'Carl', 'Rita'],
  ['What does the Golden Overlord want to be?', 'The buffest thing in the sky', 'A chef', 'A pilot'],
  ['What keeps Cubara floating?', 'The Heartstone', 'Balloons', 'Magnets'],
];

const TIPS = [
  'Press M for the map of all of Blockton County. Every shop, hospital and police station is on it.',
  'The Bank of Blockton pays interest every night you sleep. Keep your coins there!',
  'Hurt? Any hospital heals you for free. Food heals you too, and some gives you a power-up.',
  'Wanted by the police? Walk into a police station and pay your fine, or turn yourself in.',
  'The Hyper Car at Wheels & Deals has turrets, spiked wheels, a boost and jump jets.',
  'Mountains in the north-west, farms in the north, the beach in the east, the docks in the south.',
  'Take a class at the school: every right answer pays coins.',
  'Work out at the Iron Temple Gym for a big power-up.',
  'Press F5 to see yourself from behind, then from the front.',
];

const ROLE_LINES = {
  hospital: ['Welcome to the hospital. Who is hurt?', 'Feeling poorly? We can fix that.'],
  police: ['Blockton Police. How can I help?', 'Behave yourself in here, okay?'],
  school: ['Class is about to start! Grab a seat.', 'Ready to learn something?'],
  library: ['Shhh! Welcome to the library.', 'Looking for a good book?'],
  food: ['Hungry? What can I get you?', 'Fresh and hot! What will it be?'],
  mart: ['Hi there! Need anything?', 'Everything you need, right here.'],
  guns: ['Welcome to the gun shop. Browse all you like.', 'Looking for something with a bit more bang?'],
  clothes: ['Looking good! Want to try some things on?', 'New look? You came to the right place.'],
  pets: ['Aww, want a pet? They help you fight too!', 'Come and meet our furry friends.'],
  books: ['Take a look round. Every book is a good one.'],
  bank: ['Welcome to the bank. Your coins are safe with us.'],
  gym: ['No pain, no gain! Ready to work out?', 'Look at those muscles. Want more?'],
  dealer: ["Step right up! Best cars in the county, and I'm not even lying.", 'Looking for some new wheels?'],
  hotel: ['Welcome to the hotel. Need a room?'],
  home: ['Home sweet home.'],
  fire: ['Fire Station 5. Stay safe out there!'],
};

const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

// A question for the quiz: a sum, or a trivia question.
function question(kind) {
  if (kind === 'school' && Math.random() < 0.55) {
    const op = pickOne(['+', '-', '×']);
    let a = 2 + Math.floor(Math.random() * (op === '×' ? 9 : 40));
    let b = 2 + Math.floor(Math.random() * (op === '×' ? 9 : 30));
    if (op === '-' && b > a) [a, b] = [b, a];
    const ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
    const wrong = new Set();
    while (wrong.size < 2) {
      const w = ans + (Math.floor(Math.random() * 7) - 3 || 4);
      if (w !== ans && w >= 0) wrong.add(w);
    }
    return { q: `What is ${a} ${op} ${b}?`, right: String(ans), options: shuffle([String(ans), ...[...wrong].map(String)]) };
  }
  const [q, right, ...wrong] = pickOne(TRIVIA);
  return { q, right, options: shuffle([right, ...wrong]) };
}

// The menu box: who you're talking to, what they say and what you can do.
class ServiceMenu {
  constructor(game) {
    this.game = game;
    this.el = $('#svc');
    this.pic = $('#svc-pic');
    this.name = $('#svc-name');
    this.where = $('#svc-place');
    this.text = $('#svc-text');
    this.opts = $('#svc-opts');
    this.open = false;
    this.buttons = [];
    this.onKey = (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const b = this.buttons[Number(e.code.slice(5)) - 1];
        if (b && !b.disabled) b.click();
      } else if (e.code === 'Space' && this.onSpace) {
        e.preventDefault();
        this.onSpace();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  dispose() {
    this.close(true);
    window.removeEventListener('keydown', this.onKey);
  }

  // who: { name, role, skin }. options: [{ label, note, disabled, fn }]
  show(who, where, text, options) {
    const g = this.game;
    if (!this.open) {
      g.input.exitLock();
      g.setState('talk');
    }
    this.open = true;
    this.el.hidden = false;
    this.who = who;
    drawPortrait(this.pic, { name: who.name, color: '#ffd23f', skin: who.skin }, g.skin.canvas);
    this.name.textContent = who.role ? `${who.name} · ${who.role}` : who.name;
    this.where.textContent = where;
    this.text.textContent = text;
    this.onSpace = null;
    this.opts.textContent = '';
    this.buttons = [];
    options.push({ label: 'Leave', fn: () => this.close() });
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn svc-opt';
      b.disabled = !!o.disabled;
      const k = document.createElement('kbd');
      k.textContent = String(i + 1);
      const l = document.createElement('span');
      l.textContent = o.label;
      b.append(k, l);
      if (o.note) {
        const n = document.createElement('small');
        n.textContent = o.note;
        b.append(n);
      }
      b.addEventListener('click', () => {
        g.sound.click();
        o.fn();
      });
      this.opts.append(b);
      this.buttons.push(b);
    });
    const first = this.buttons.find((b) => !b.disabled);
    if (first) first.focus();
  }

  close(silent = false) {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onSpace = null;
    if (this.onClose) {
      const f = this.onClose;
      this.onClose = null;
      f();
    }
    if (!silent) {
      const g = this.game;
      if (g.state === 'talk') {
        g.setState('playing');
        g.lockMouse();
      }
    }
  }
}

export class Places {
  constructor(adv) {
    this.adv = adv;
    this.game = adv.game;
    this.list = adv.info.places.map((p, i) => ({ ...p, i, people: null }));
    this.menu = new ServiceMenu(this.game);
    this.t = 0;
    this.jail = null;
  }

  dispose() {
    for (const p of this.list) this.dismiss(p);
    this.menu.dispose();
    if (this.jail) this.openCell(this.jail.cell, false);
    this.jail = null;
  }

  get prog() {
    return this.adv.prog;
  }

  center(p) {
    const [x0, z0, x1, z1] = p.room;
    return [(x0 + x1) / 2, (z0 + z1) / 2];
  }

  // Staff come to work when you're close, and go home when you're not.
  // all: you just jumped somewhere (the hospital, jail): everyone at once.
  update(dt, all = false) {
    this.t -= dt;
    if (this.t <= 0 || all) {
      this.t = 0.5;
      const pp = this.game.player.pos;
      // A few at a time, so driving into town doesn't stutter.
      let hired = 0;
      for (const p of this.list) {
        const [cx, cz] = this.center(p);
        const d = Math.hypot(pp.x - cx, pp.z - cz);
        if (d < 70 && !p.people && (hired < 3 || all)) {
          this.hire(p);
          hired++;
        } else if (d > 100 && p.people) this.dismiss(p);
      }
    }
    this.updateJail(dt);
    // Stand at your post: staff drift back if something pushed them.
    for (const p of this.list) {
      if (!p.people) continue;
      for (const person of p.people) if (person.pos.distanceToSquared(person.home) > 0.09 && person.knockT <= 0) person.pos.lerp(person.home, Math.min(1, dt * 3));
    }
  }

  hire(p) {
    p.people = p.staff.map((s) => {
      const person = this.adv.addPerson({ x: s.x, z: s.z, yaw: s.yaw, name: s.name, title: `${s.name} · ${s.title}`, seed: s.seed, staff: true });
      person.role = s.title;
      person.place = p;
      person.home = person.pos.clone();
      return person;
    });
  }

  dismiss(p) {
    if (!p.people) return;
    for (const person of p.people) this.adv.removePerson(person);
    p.people = null;
  }

  // Someone behind a counter you can talk to.
  nearest() {
    const pp = this.game.player.pos;
    let best = null;
    let bd = 3.4;
    for (const p of this.list) {
      if (!p.people) continue;
      const [x0, z0, x1, z1] = p.room;
      const inside = pp.x >= x0 - 0.5 && pp.x <= x1 + 1.5 && pp.z >= z0 - 0.5 && pp.z <= z1 + 1.5 && pp.y < GY + 4;
      for (const person of p.people) {
        const d = Math.hypot(person.pos.x - pp.x, person.pos.z - pp.z);
        if (d < bd && (inside || d < 2)) {
          bd = d;
          best = person;
        }
      }
    }
    return best;
  }

  // --- Talking to staff ---------------------------------------------------------

  talk(person, text) {
    const p = person.place;
    const who = { name: person.name, role: person.role, skin: person.canvas };
    const line = text || pickOne(ROLE_LINES[p.type] || ROLE_LINES.mart);
    const opts = this.options(p, person);
    this.menu.show(who, p.name, line, opts);
  }

  // Say something, then show the menu again.
  reply(person, text) {
    this.talk(person, text);
  }

  coins() {
    return this.game.profile.coins;
  }

  pay(n) {
    const pr = this.game.profile;
    if (pr.coins < n) return false;
    pr.coins -= n;
    pr.changed();
    this.game.sound.coin();
    return true;
  }

  options(p, person) {
    const g = this.game;
    const pl = g.player;
    const hurt = pl.hp < pl.maxHp;
    const buy = (label, cost, fx) => ({
      label: `${label}`,
      note: `${cost} coins${fx.heal ? ` · +${fx.heal / 2} hearts` : ''}${fx.buff ? ' · power-up' : ''}`,
      disabled: this.coins() < cost,
      fn: () => {
        if (!this.pay(cost)) return;
        if (fx.heal) pl.heal(fx.heal);
        if (fx.buff) pl.addBuff(fx.buff);
        g.sound.pickup();
        this.reply(person, pickOne(['Enjoy!', 'There you go!', 'Good choice!', 'Yum!']) + (fx.buff ? ' That should give you a boost.' : ''));
      },
    });
    switch (p.type) {
      case 'hospital':
        if (person.role === 'Doctor')
          return [
            { label: 'Ask for a check-up', note: 'Free', fn: () => this.reply(person, hurt ? 'A few bumps and bruises. See the nurse at the front and she will patch you up.' : 'You are fit as a fiddle! Keep eating your vegetables.') },
            { label: 'Super vitamins', note: '40 coins · a shield for 30 seconds', disabled: this.coins() < 40, fn: () => this.pay(40) && (pl.addBuff('shield'), (pl.buffs.shield = 30), this.reply(person, 'One super vitamin. You will feel tough as nails.')) },
          ];
        return [
          { label: 'Heal me', note: hurt ? 'Free · all your hearts back' : 'You are not hurt', disabled: !hurt, fn: () => (pl.heal(99), g.sound.pickup(), this.reply(person, 'All better! Try not to get cubed out there.')) },
          { label: 'Ask about the beds', note: 'Where you wake up', fn: () => this.reply(person, 'If you ever get knocked out, the ambulance brings you to the nearest hospital and you wake up in one of our beds.') },
        ];
      case 'police': {
        const pol = this.adv.police;
        const stars = pol.stars;
        const fine = stars * 60;
        return [
          { label: 'Pay my fine', note: stars ? `${fine} coins · clears ${stars} star${stars > 1 ? 's' : ''}` : 'You are not wanted', disabled: !stars || this.coins() < fine, fn: () => this.pay(fine) && (pol.reset(), this.reply(person, 'Fine paid. Your record is clean. Now stay out of trouble!')) },
          { label: 'Turn myself in', note: stars ? 'Free · a few seconds in a cell' : 'You are not wanted', disabled: !stars, fn: () => (this.menu.close(), this.lockUp(p, 8, 'You turned yourself in. The stars are gone.')) },
          { label: 'Go on patrol', note: 'Police job · catch robbers for coins', disabled: !!this.adv.active || !!this.adv.webs.crimes.active, fn: () => (this.menu.close(), this.adv.webs.crimes.start('robbery', true)) },
        ];
      }
      case 'school':
        if (person.role === 'Lunch Lady') return [buy('School lunch', 5, { heal: 10 }), buy('Chocolate milk', 3, { heal: 4 })];
        return [
          { label: 'Take a class', note: '5 questions · 15 coins for each right answer', fn: () => this.quiz(person, 'school') },
          { label: 'Report card', note: `${this.prog.classes || 0} classes passed`, fn: () => this.reply(person, this.prog.classes ? `You have passed ${this.prog.classes} class${this.prog.classes > 1 ? 'es' : ''}. ${this.prog.classes >= 5 ? 'Top of the class!' : 'Keep it up!'}` : 'No classes yet. Why not take one now?') },
        ];
      case 'library':
        return [
          { label: 'Book club quiz', note: '5 questions · 15 coins each', fn: () => this.quiz(person, 'library') },
          { label: 'Read a book', note: 'A tip about Blockton', fn: () => this.reply(person, pickOne(TIPS)) },
        ];
      case 'food':
        return (FOODS[p.menu] || FOODS.snack).map(([n, c, fx]) => buy(n, c, fx));
      case 'mart':
        return MART.map(([n, c, fx]) => buy(n, c, fx));
      case 'guns': {
        const full = pl.grenades >= 5;
        return [
          { label: 'Look at the guns', note: 'Opens the Armory', fn: () => (this.menu.close(true), g.openArmory('playing')) },
          { label: 'Grenades', note: full ? 'You have 5 already' : '40 coins · fill up to 5', disabled: full || this.coins() < 40, fn: () => this.pay(40) && ((pl.grenades = 5), this.reply(person, 'Five grenades. Throw them with G. Carefully!')) },
        ];
      }
      case 'clothes':
      case 'pets':
        return [
          { label: p.type === 'pets' ? 'See the pets' : 'Hats, capes and more', note: 'Opens the Style shop', fn: () => (this.menu.close(true), g.openStyle('playing')) },
          { label: 'Change my skin', note: 'Opens the skin editor', fn: () => (this.menu.close(true), g.openEditor('playing')) },
        ];
      case 'books':
        return [{ label: 'Read a comic', note: 'A tip about Blockton', fn: () => this.reply(person, pickOne(TIPS)) }];
      case 'bank': {
        const bal = this.prog.bank || 0;
        return [
          { label: 'Put all my coins in', note: `You have ${this.coins()} coins`, disabled: this.coins() <= 0, fn: () => this.deposit(person) },
          { label: 'Take all my coins out', note: `${bal} coins in the bank`, disabled: bal <= 0, fn: () => this.withdraw(person) },
          { label: 'How does it work?', fn: () => this.reply(person, 'Coins in the bank earn 5% interest every night you sleep, up to 500 coins a night. Sleep at home or in a hotel.') },
        ];
      }
      case 'gym':
        return [
          { label: 'Work out', note: 'Mash SPACE · win a power-up', fn: () => this.workout(person) },
          buy('Protein shake', 10, { heal: 6, buff: 'dmg' }),
        ];
      case 'dealer':
        return this.carOptions(person);
      case 'hotel':
        return [{ label: 'Rent a room for the night', note: '30 coins · sleep till morning', disabled: this.coins() < 30, fn: () => this.pay(30) && this.sleep() }];
      case 'home':
        return [];
      case 'fire':
        return [
          { label: 'Fire drill', note: 'Job · race the fire truck to 3 fires', disabled: !!this.adv.active, fn: () => (this.menu.close(), this.adv.startMission('fire')) },
          { label: 'Safety tip', fn: () => this.reply(person, pickOne(['Never play with matches!', 'If you hear a siren, pull over and let us through.', 'Stop, drop and roll!'])) },
        ];
      default:
        return [];
    }
  }

  deposit(person) {
    const pr = this.game.profile;
    const n = pr.coins;
    this.prog.bank = (this.prog.bank || 0) + n;
    pr.coins = 0;
    pr.changed();
    this.game.sound.coin();
    this.reply(person, `${n} coins are safe in the bank. That's ${this.prog.bank} in total.`);
  }

  withdraw(person) {
    const n = this.prog.bank || 0;
    this.prog.bank = 0;
    this.game.profile.addCoins(n);
    this.game.profile.changed();
    this.game.sound.coin();
    this.reply(person, `Here are your ${n} coins. Spend them wisely!`);
  }

  carOptions(person) {
    const owned = new Set(this.prog.cars || []);
    return FOR_SALE.filter(([id]) => CAR_TYPES[id]).map(([id, price]) => ({
      label: `${CAR_TYPES[id].name}${owned.has(id) ? ' (yours)' : ''}`,
      note: owned.has(id) ? 'Bring it round' : `${price} coins`,
      disabled: !owned.has(id) && this.coins() < price,
      fn: () => {
        if (!owned.has(id)) {
          if (!this.pay(price)) return;
          this.prog.cars = [...(this.prog.cars || []), id];
          this.game.progress.event('buycar', { id });
        }
        this.adv.deliverCar(id);
        this.game.profile.scheduleSave();
        this.reply(person, owned.has(id) ? `Your ${CAR_TYPES[id].name} is waiting outside, and it's in your driveway from now on.` : `Congratulations! The ${CAR_TYPES[id].name} is yours. It's parked outside, and it will be in your driveway every time you visit Blockton.`);
      },
    }));
  }

  // --- The quiz ---------------------------------------------------------------

  quiz(person, kind) {
    const who = { name: person.name, role: person.role, skin: person.canvas };
    const place = person.place.name;
    const state = { n: 0, right: 0 };
    const ask = () => {
      const q = question(kind);
      state.q = q;
      this.menu.show(
        who,
        place,
        `Question ${state.n + 1} of 5. ${q.q}`,
        q.options.map((o) => ({ label: o, fn: () => answer(o) })),
      );
    };
    const answer = (o) => {
      const ok = o === state.q.right;
      if (ok) state.right++;
      state.n++;
      this.game.sound[ok ? 'pickup' : 'click']();
      const said = ok ? pickOne(['Correct!', 'Well done!', "That's right!", 'Brilliant!']) : `Not quite. It's ${state.q.right}.`;
      if (state.n >= 5) return finish(said);
      this.menu.show(who, place, said, [{ label: 'Next question', fn: ask }]);
    };
    const finish = (said) => {
      const coins = state.right * 15 + (state.right === 5 ? 25 : 0);
      if (coins) this.game.gainCoins(coins);
      this.game.progress.addXp(state.right * 20);
      if (state.right >= 3) this.prog.classes = (this.prog.classes || 0) + 1;
      this.game.progress.event('class', { right: state.right });
      this.game.profile.scheduleSave();
      const grade = state.right === 5 ? 'A+! Perfect score!' : state.right >= 4 ? 'A great result!' : state.right >= 3 ? 'You passed!' : 'Keep practising!';
      this.reply(person, `${said} You got ${state.right} out of 5. ${grade}${coins ? ` Here are ${coins} coins.` : ''}`);
    };
    ask();
  }

  // --- The gym ----------------------------------------------------------------

  workout(person) {
    const who = { name: person.name, role: person.role, skin: person.canvas };
    let reps = 0;
    let t = 8;
    const show = () => this.menu.show(who, person.place.name, `Mash SPACE as fast as you can! Reps: ${reps} · ${Math.ceil(t)}s`, []);
    show();
    this.menu.onSpace = () => {
      reps++;
      this.game.sound.click();
      this.menu.text.textContent = `Mash SPACE as fast as you can! Reps: ${reps} · ${Math.ceil(t)}s`;
    };
    const tick = setInterval(() => {
      t -= 0.25;
      if (!this.menu.open) {
        clearInterval(tick);
        return;
      }
      this.menu.text.textContent = `Mash SPACE as fast as you can! Reps: ${reps} · ${Math.max(0, Math.ceil(t))}s`;
      if (t > 0) return;
      clearInterval(tick);
      const pl = this.game.player;
      const big = reps >= 45;
      if (reps >= 15) {
        pl.addBuff('dmg');
        pl.buffs.dmg = big ? 60 : 30;
        if (big) {
          pl.addBuff('speed');
          pl.buffs.speed = 60;
        }
      }
      this.game.progress.event('gym', { reps });
      this.reply(person, reps >= 45 ? `${reps} reps! You are a machine! Double damage and super speed for a whole minute.` : reps >= 15 ? `${reps} reps. Nice pump! Double damage for 30 seconds.` : `${reps} reps? Come on, you can do better than that!`);
    }, 250);
  }

  // --- Sleeping ---------------------------------------------------------------

  sleep() {
    const g = this.game;
    this.menu.close();
    g.player.heal(99);
    // Wake up in the morning.
    if (g.sky && g.sky.active) g.sky.t = 0.04;
    const bal = this.prog.bank || 0;
    const interest = Math.min(500, Math.floor(bal * 0.05));
    if (interest > 0) this.prog.bank = bal + interest;
    g.profile.scheduleSave();
    g.hud.showBanner('Good morning!', interest ? `Your bank savings earned ${interest} coins overnight.` : 'You slept like a log.', 3.5);
    g.sound.cleared();
  }

  // --- Jail ---------------------------------------------------------------------

  // The police station with cells nearest to (x, z).
  nearestStation(x, z) {
    let best = null;
    let bd = Infinity;
    for (const p of this.list) {
      if (p.type !== 'police' || !p.cells || !p.cells.length) continue;
      const [cx, cz] = this.center(p);
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  openCell(cell, open) {
    const w = this.game.world;
    const [x, z] = cell.door;
    for (let y = GY + 1; y <= GY + 2; y++) w.set(x, y, z, open ? B.AIR : B.BARS, true);
  }

  // Put you in a cell for `secs` seconds. Returns false if there's no jail.
  lockUp(station, secs, why, title = 'In jail!') {
    const g = this.game;
    const p = station || this.nearestStation(g.player.pos.x, g.player.pos.z);
    if (!p || !p.cells.length) return false;
    const cell = p.cells[Math.floor(Math.random() * p.cells.length)];
    if (this.jail) this.openCell(this.jail.cell, false);
    this.openCell(cell, false);
    this.adv.police.reset();
    const pl = g.player;
    if (pl.driving) this.adv.exitCar(true);
    pl.reset(new pl.pos.constructor(cell.x, GY + 1, cell.z));
    pl.yaw = cell.yaw + Math.PI;
    pl.vel.set(0, 0, 0);
    this.jail = { cell, t: secs, open: false };
    g.world.stream(cell.x, cell.z, Infinity, 5);
    g.hud.showBanner(title, why, 3.5);
    g.sound.clank(1);
    return true;
  }

  updateJail(dt) {
    const j = this.jail;
    if (!j) return;
    const g = this.game;
    if (!j.open) {
      j.t -= dt;
      if (j.t <= 0) {
        j.open = true;
        this.openCell(j.cell, true);
        g.sound.clank(0.8);
        g.hud.showBanner("You're free to go!", 'Stay out of trouble, okay?', 2.5);
        j.t = 0;
      }
      return;
    }
    // Shut the door again once you've walked out.
    j.t += dt;
    const pp = g.player.pos;
    if (Math.hypot(pp.x - j.cell.x, pp.z - j.cell.z) > 5 || j.t > 40) {
      this.openCell(j.cell, false);
      this.jail = null;
    }
  }

  // What to show at the bottom of the screen while you're locked up.
  jailPrompt() {
    const j = this.jail;
    return j && !j.open ? `In a cell · free in ${Math.max(0, Math.ceil(j.t))}s` : '';
  }

  // Where you wake up after being knocked out: a bed in the nearest hospital.
  wakeUp(x, z) {
    let best = null;
    let bd = Infinity;
    for (const p of this.list) {
      if (p.type !== 'hospital' || !p.beds || !p.beds.length) continue;
      const [cx, cz] = this.center(p);
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return null;
    const bed = best.beds[Math.floor(Math.random() * best.beds.length)];
    return { x: bed.x, z: bed.z, name: best.name };
  }

  // Everything for the map: [x, z, type, name].
  markers() {
    return this.list.map((p) => {
      const [cx, cz] = this.center(p);
      return [cx, cz, p.type, p.name];
    });
  }
}
