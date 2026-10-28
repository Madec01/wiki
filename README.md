# WikiJeux

Treize jeux en français construits sur Wikipédia, Wikimedia Commons et Wikidata. Une seule page HTML, aucun serveur, aucune clé API : tout est chargé en direct depuis les API publiques de Wikimedia.

**Jouer en ligne** : https://madec01.github.io/wiki/ (une fois GitHub Pages activé, voir plus bas).

## Les jeux

### Deviner
| Jeu | Principe |
| --- | --- |
| 🖼️ **Devine l’image** | L’image principale d’un article s’affiche. Trois façons de répondre : *cash* (100 pts), *les traits* qui montrent le nombre de lettres (60 pts), *lettres posées* avec un tiers des lettres dévoilées (30 pts). Chaque erreur coûte 10 pts et une vie, façon pendu. Défi du jour partagé par tous les joueurs. |
| 🕶️ **Résumé caviardé** | Le résumé est masqué mot par mot, chaque bloc affiche son nombre de lettres. Clique sur un bloc et tape ce qu’il cache : un mot trouvé se dévoile partout. Tous les 5 essais ratés, une partie des mots dévoile sa première lettre. Le texte s’affiche en clair à la fin. |
| 🗂️ **Les catégories** | Cinq catégories d’un article, puis une de plus par erreur. Indices : traits du titre, image, description. |
| 🔀 **Anagramme** | Les lettres du titre sont mélangées mot par mot. Indices payants : image, description, premières lettres. |
| ✍️ **Texte à trous** | Le début de l’article avec trois mots clés effacés, à choisir parmi quatre propositions (saisie libre en Difficile). |

### Comparer et classer
| Jeu | Principe |
| --- | --- |
| 📈 **Plus ou moins de vues** | Lequel des deux articles a été le plus lu ? Modes 3 vies, Survie ou 10 duels. |
| 🎂 **Qui est le plus vieux ?** | Deux personnalités de la même époque (moins de 30 ans d’écart en Normal, 12 ans et sans photo en Difficile), clique sur celle née en premier. |
| 🏘️ **Combien d’habitants ?** | D’abord plus ou moins peuplée qu’une ville de référence (30 pts), puis estimation au curseur (jusqu’à 70 pts). |
| 🕰️ **Frise chronologique** | Place chaque carte (naissance, sortie de film, construction…) au bon endroit dans la frise. Modes Classique, Marathon, Sans filet, et Classement où l’on range toutes les cartes avant de valider. |

### Explorer
| Jeu | Principe |
| --- | --- |
| 🗣️ **Devine la langue** | Un article connu dans une autre langue, quatre propositions de même écriture. |
| 🗺️ **Où dans le monde ?** | Une photo d’un lieu : dans quel pays ? Six propositions du même continent. En Difficile, plante ton épingle sur la carte. |
| 🏁 **Course de liens** | Rejoins l’article cible en cliquant uniquement sur les liens internes. Clics et chrono. |
| 🔗 **Le chaînon manquant** | Trouve, parmi quatre, l’article qui relie A à C : A → ? → C. En Difficile, saisie libre et toute solution valide est acceptée. |

Les articles joués récemment sont mémorisés pour varier les parties. Trois niveaux (Facile, Normal, Difficile) règlent la notoriété des sujets tirés et, selon le jeu, les indices offerts. Le thème Animaux ne propose que des espèces. Les thèmes (Populaire, Cinéma, Personnalités, Animaux, Villes, Pays, Monuments, Jeux vidéo, Musique, Peinture, Séries…) viennent des modèles d’infobox de Wikipédia, triés par nombre de liens entrants pour rester sur des sujets connus. Le thème « Populaire » utilise les pages les plus lues de l’avant-veille.

## Lancer en local

Ouvre simplement `index.html` dans un navigateur, ou sers le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000/
```

Aucune dépendance à installer. La carte charge Leaflet depuis unpkg et les tuiles depuis OpenStreetMap.

## Publier avec GitHub Pages

1. Sur GitHub, ouvre **Settings → Pages**.
2. Dans *Build and deployment*, choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Enregistre : le site est en ligne quelques minutes plus tard à `https://<ton-compte>.github.io/wiki/`.

## Tests

Les tests de bout en bout utilisent Playwright et simulent les API Wikimedia (pas de réseau nécessaire) :

```bash
npm install playwright   # une fois, si Playwright n'est pas déjà présent
node tests/run.js        # API simulées
node tests/run.js --live # contre les vraies API (soumis aux quotas Wikimedia)
node tests/run.js --only=image_partie
```

## Structure

```
index.html            page unique, charge les scripts dans l'ordre
css/style.css         thème clair/sombre, mobile first
js/core/util.js       utilitaires (DOM, aléatoire déterministe, dates)
js/core/store.js      localStorage : scores, records, défi du jour, cache
js/core/api.js        API Wikipédia (REST + action), pageviews, Wikidata SPARQL, Commons
js/core/answer.js     normalisation des réponses, tolérance aux fautes, redirections, masques pendu
js/core/text.js       découpage en mots, mots-outils, extraits
js/core/pool.js       viviers d'articles : populaires et thématiques, filtres d'images
js/core/ui.js         composants : autocomplétion, écran de début/fin, cadre de jeu
js/core/game.js       registre des jeux et moteur de manches
js/core/app.js        routeur (#/jeu?theme=…) et accueil
js/games/*.js         un fichier par jeu
tests/                Playwright : run.js, scenarios.js, mock.js, fixtures/
```

## Données et licences

Textes et images : [Wikipédia](https://fr.wikipedia.org) et [Wikimedia Commons](https://commons.wikimedia.org), licence CC BY-SA ; le crédit de chaque image est affiché en fin de manche. Données structurées : [Wikidata](https://www.wikidata.org), CC0. Fond de carte : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright). Les scores restent dans le navigateur du joueur.
