# Semaphore UI

[Semaphore UI](https://semaphoreui.com/) est une interface web libre pour
lancer des playbooks Ansible, du code Terraform/OpenTofu et des scripts shell
ou Python : chaque « modèle » (template) est un travail qu'on lance d'un clic
et dont on suit le résultat. Cette intégration amène dans Gladys les modèles
**que vous autorisez** : chacun devient un appareil avec le statut de sa
dernière tâche, une scène peut **lancer un modèle** (et attendre sa fin) ou
**arrêter** sa tâche en cours, des scènes peuvent réagir quand une tâche
**réussit** ou **échoue**, et un widget du tableau de bord affiche leur dernier
statut avec un bouton **Lancer**.

Testée contre un vrai Semaphore UI 2.19 (Docker, SQLite, playbooks Ansible) ;
pas encore contre une vraie instance Gladys : vos retours sont les bienvenus
sur [les issues](https://github.com/guim31/gladys-semaphore/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Semaphore UI 2.x, joignable depuis la machine de Gladys.
- Un jeton d'API d'un utilisateur de Semaphore qui peut lancer les modèles
  (rôle « Task Runner » ou plus dans son projet).

Lancer un modèle exécute du code sur vos machines. C'est pourquoi rien n'est
lançable depuis Gladys tant que vous n'avez pas saisi son numéro dans la liste
des modèles autorisés, et pourquoi l'intégration ne lit jamais la sortie des
tâches (les journaux d'Ansible peuvent contenir des secrets) : seulement leur
statut et leur durée.

À chaque actualisation (une minute par défaut), l'intégration lit la liste des
projets, puis les modèles des projets qui contiennent un modèle autorisé ;
toutes les 5 secondes pendant qu'une tâche d'un modèle autorisé tourne.
Semaphore ne limite pas le nombre de requêtes à son API.

## Mise en route

### 1. Créer un jeton d'API

Dans Semaphore, ouvrez le menu utilisateur (en bas à gauche) → **API tokens**
et créez un jeton. Sur une version sans cet écran, l'API en crée un :
`POST /api/user/tokens` une fois connecté. Le jeton agit avec les droits de son
utilisateur : un utilisateur dédié, membre des seuls projets concernés, limite
ce que Gladys peut faire.

### 2. Configurer l'intégration

Dans Gladys, **Intégrations → Semaphore UI → Configuration** :

- **Adresse de Semaphore** : l'adresse avec laquelle vous ouvrez Semaphore,
  ex. `http://192.168.1.2:3000` (le port 3000 est ajouté à une adresse IP
  seule).
- **Jeton d'API** : le jeton de l'étape 1.
- **Langue des noms** : français par défaut ; elle fixe les noms des
  fonctionnalités à l'ajout d'un appareil, les statuts et les résultats de
  scène.

Enregistrez, puis cliquez sur **Tester la connexion** : la liste de tous les
modèles que voit le jeton s'affiche, avec leur numéro, leur projet et leur nom,
ex. `#3 Home lab : Update servers`.

### 3. Autoriser des modèles

Saisissez dans **Modèles autorisés (numéros)** les numéros des modèles que
Gladys peut suivre et lancer, séparés par des virgules : `3, 7`. Le numéro
figure aussi dans l'adresse d'un modèle dans Semaphore
(`…/project/1/templates/3`). Vide : rien n'est suivi, rien n'est lançable.

### 4. Ajouter les appareils

Dans l'onglet **Découverte**, ajoutez les modèles voulus comme appareils. Les
déclencheurs, les actions et le widget fonctionnent pour tout modèle autorisé ;
les appareils apportent les états et l'historique.

## Les appareils

Un appareil par modèle autorisé, à son nom :

| Fonctionnalité             | Signification                                                                  |
| -------------------------- | ------------------------------------------------------------------------------ |
| Dernière tâche             | statut de la dernière tâche : Réussi, En échec, En cours, Arrêté, En attente…  |
| Dernière tâche réussie     | 1 quand la dernière tâche terminée a réussi, 0 si elle a échoué ou été arrêtée |
| En cours                   | 1 pendant qu'une tâche du modèle tourne                                        |
| Dernier lancement          | début de la dernière tâche (jour/mois heures:minutes, fuseau de Gladys)        |
| Durée de la dernière tâche | durée de la dernière tâche terminée, en secondes                               |

L'appareil n'a aucune commande : lancer Ansible n'est pas un interrupteur
qu'un assistant vocal ou un appui malencontreux devrait atteindre. Un modèle se
lance depuis une scène ou depuis le widget, qui demande une confirmation.

## Tableau de bord

Le widget **Modèles Semaphore** liste les modèles autorisés (ou ceux choisis
dans ses réglages), ceux en échec d'abord, puis ceux en cours : dernier statut,
heure de début, durée. Sous la liste, un bouton par modèle (les trois premiers) :
**Lancer**, ou **Arrêter** pendant qu'une tâche tourne. Gladys demande une
confirmation avant de l'envoyer. **Actualiser** relit Semaphore.

## Scènes

### Déclencheurs

- **Une tâche Semaphore réussit** : une tâche d'un modèle autorisé se termine
  avec succès.
- **Une tâche Semaphore échoue** : une tâche d'un modèle autorisé se termine en
  erreur.

Les deux peuvent être limités à certains modèles, et donnent le nom du modèle,
le projet, le numéro de la tâche et la durée en secondes. Une tâche arrêtée
n'est ni l'un ni l'autre. Les tâches lancées depuis Semaphore lui-même, une
planification ou un autre outil comptent aussi. La première lecture après
l'installation n'annonce rien du passé ; une tâche terminée pendant un
redémarrage de Gladys ou de l'intégration est annoncée une fois.

### Actions

- **Lancer un modèle Semaphore** : lance un modèle autorisé. **Variables
  supplémentaires (JSON)** est facultatif : un objet JSON transmis à la tâche,
  ex. `{"target": "web1"}` (les valeurs de la scène peuvent y être insérées).
  Avec **Attendre la fin (90 s au plus)**, la scène attend la tâche et les
  actions suivantes reçoivent son résultat. Sorties : numéro de la tâche,
  terminée, réussie, statut, durée (s).
- **Arrêter une tâche Semaphore** : arrête la tâche en cours d'un modèle
  autorisé. Sorties : une tâche a été arrêtée (oui/non), numéro de la tâche.

Les deux refusent un modèle absent de la liste des modèles autorisés, même si
son appareil existe encore dans Gladys.

### Idées de scènes

- Chaque dimanche à 3 h, lancer « Update servers » ; quand **Une tâche
  Semaphore échoue**, envoyer un message Telegram : « {{triggerEvent.data.template}}
  a échoué après {{triggerEvent.data.duration}} s ».
- En quittant la maison, lancer « Nightly backup » avec **Attendre la fin**,
  puis vous prévenir seulement si « Réussie » est faux.
- Un bouton sur la tablette murale : le widget, avec « Redémarrer le serveur
  multimédia » autorisé.

## Dépannage

- **Jeton d'API refusé** : le jeton a été supprimé ou mal recopié ; créez-en un
  nouveau.
- **Refusé par Semaphore : cet utilisateur n'a pas le droit de lancer des
  tâches dans le projet** : donnez à l'utilisateur du jeton le rôle « Task
  Runner » (ou plus) dans le projet.
- **Autorisés mais introuvables** : le numéro est faux, le modèle a été
  supprimé, ou l'utilisateur du jeton n'est pas membre de son projet. **Tester
  la connexion** liste ce que voit le jeton.
- **Aucune API Semaphore à cette adresse** : vérifiez l'adresse et le port ;
  derrière un proxy inverse, incluez son chemin.
- **L'adresse redirige** : saisissez l'adresse en `https://`.
- Une tâche n'apparaît pas tout de suite : l'intégration lit Semaphore chaque
  minute (réglable), toutes les 5 secondes pendant qu'une tâche tourne.

## Limites

- Seule la dernière tâche de chaque modèle est lue : si deux tâches du même
  modèle se terminent entre deux lectures, seule la dernière déclenche une
  scène.
- La sortie des tâches n'est jamais lue ni affichée, par choix.
- « Attendre la fin » attend 90 s au plus (la limite d'une action de scène dans
  Gladys) ; une tâche plus longue continue, et les déclencheurs signalent sa
  fin.
- Les tâches Terraform en attente de confirmation affichent « À confirmer » ;
  la confirmation se fait dans Semaphore.
- Développée et testée contre Semaphore UI 2.19.17 ; les versions 2.x plus
  anciennes devraient fonctionner (même API), sans test.
