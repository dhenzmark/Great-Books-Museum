/*
  The plan of the museum the whole site walks through: one building, a wing per page, in the
  order of the menu (Home, Analyses, Masterpiece, Learning, Reflection, Profile). Each room
  shows one painting, with its wall label, and stands for one section of its page: the page
  marks where you walk to it with a .walk-gap, and the section after the gap is what comes up
  over the view when you arrive.

  A room: id, title (on the label), kicker (the label's small line), lens (optional, the label's
  foot), plate { src, look { title, caption } }, trad (which colours the room is painted in:
  hebrew, indian, greek, french), others (paintings for a second wall, by file name).
*/
import works from "../data/works.js";

const room = (id, title, kicker, src, caption, trad, others = []) => ({
  id,
  title,
  kicker,
  plate: { src: `assets/img/${src}.webp`, look: { caption } },
  trad,
  others,
});

export const WINGS = {
  home: [
    room("hall", "Seven Epics, One Reader", "The entrance hall", "hero-turner-polyphemus", "J. M. W. Turner, Ulysses Deriding Polyphemus, 1829. The National Gallery, London.", "greek", ["job-blake-watercolor", "ramayana-ravi-varma-jatayu"]),
    room("timeline", "Across Three Thousand Years", "The timeline", "roland-fouquet", "Jean Fouquet, The Death of Roland, c. 1455–60. Bibliothèque nationale de France.", "french", ["panchatantra-mongoose"]),
  ],
  analyses: works.map((w) => ({ ...w })),
  masterpiece: [
    room("rage", "The Anger of Achilles", "Favorite work · I", "iliad-matsch-triumph", "Franz von Matsch, The Triumph of Achilles, 1892. Achilleion Palace, Corfu.", "greek"),
    room("grief", "What Grief Does", "Favorite work · II", "iliad-patroclus", "Gavin Hamilton, Achilles Lamenting the Death of Patroclus, 1760–63. Scottish National Gallery.", "greek"),
    room("hero", "Two Kinds of Hero", "Favorite work · III", "iliad-pompeii-fresco", "Wall painting from Pompeii, 1st century CE. Detail of a warrior.", "greek"),
    room("scene", "Hector and Andromache", "Favorite work · IV", "iliad-david-andromache", "Jacques-Louis David, Andromache Mourning Hector, 1783. Musée du Louvre.", "greek", ["iliad-ivanov-priam"]),
  ],
  learning: [
    room("lessons", "What the Works Taught", "Summary of learning · I", "homer-bust", "Bust of Homer, Roman copy of a Hellenistic original. The British Museum.", "greek"),
    room("lenses", "Ways of Reading", "Summary of learning · II", "roland-michallon", "Achille-Etna Michallon, Landscape with the Death of Roland, c. 1819–22.", "french"),
    room("compare", "Seven Works Side by Side", "Summary of learning · III", "odyssey-waterhouse-penelope", "John William Waterhouse, Penelope and the Suitors, 1912. Aberdeen Art Gallery.", "greek"),
    room("craft", "How They Are Told", "Summary of learning · IV", "roland-chroniques", "The Death of Roland, Grandes Chroniques de France, c. 1375–80.", "french"),
  ],
  reflection: [
    room("letter", "Looking Back", "Personal reflection", "iliad-david-andromache", "Jacques-Louis David, Andromache Mourning Hector, 1783. Musée du Louvre.", "greek", ["hero-turner-polyphemus"]),
  ],
  profile: [
    room("reader", "The Reader", "Student profile · I", "mahabharata-krishna-arjuna", "Krishna and Arjuna on the chariot, India, 18th–19th century.", "indian"),
    room("figures", "The Portfolio in Numbers", "Student profile · II", "odyssey-waterhouse-sirens", "John William Waterhouse, Ulysses and the Sirens, 1891. National Gallery of Victoria.", "greek"),
  ],
};

/* every room in walking order, and where each page's wing begins */
export const ORDER = ["home", "analyses", "masterpiece", "learning", "reflection", "profile"];
export const ROOMS = ORDER.flatMap((name) => WINGS[name]);
export const WING_START = {};
ORDER.reduce((at, name) => ((WING_START[name] = at), at + WINGS[name].length), 0);
