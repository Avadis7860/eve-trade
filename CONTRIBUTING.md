# 🤝 Guide de Contribution — EVE Trade

Merci de votre intérêt pour le projet **EVE Trade** ! Ce document définit les standards de développement, les conventions de code et le cycle de vie des contributions.

---

## 🛠️ Configuration de l'Environnement

1. **Clonage du dépôt et installation :**
   ```bash
   git clone https://github.com/votre-compte/eve-trade.git
   cd eve-trade
   npm ci
   ```

2. **Lancement du serveur de développement :**
   ```bash
   npm run dev
   ```
   L'application est accessible sur `http://localhost:3000`.

---

## 📜 Conventions de Code & Qualité

### 1. TypeScript & Typage Strict
* **Zéro `any` non justifié :** Toutes les structures de données doivent être typées dans le module approprié sous `src/types/` (`universe.ts`, `market.ts`, `financial.ts`, `character.ts`, `execution.ts`).
* **Imports nommés :** Toujours utiliser des imports explicites en haut de fichier (`import { FeeEngine } from './engine/fee';`).
* **Enums TypeScript :** Utiliser des `enum` standard (ou des unions de chaînes typées). Ne jamais utiliser `const enum`.

### 2. Moteurs Mathématiques Purs
* Tout nouveau calcul financier ou algorithme doit être intégré dans `/src/engine/`.
* Les moteurs **ne doivent pas** comporter d'états mutables globaux, de dépendances réseau ou d'appels DOM.
* Tout ajout dans `/src/engine/` doit s'accompagner de tests unitaires dans `/src/engine/__tests__/`.

### 3. Interface Utilisateur & Design System
* **Tailwind CSS :** Utiliser exclusivement les classes utilitaires Tailwind.
* **Icônes :** Utiliser exclusivement `lucide-react`.
* **Palette :** Thème sombre raffiné EVE Online (*Slate/Zinc/Emerald/Amber/Rose*).

---

## 🧪 Processus de Validation Obligatoire

Avant de soumettre une Pull Request (PR), assurez-vous que toutes les vérifications suivantes sont valides :

```bash
# 1. Exécuter l'ensemble des tests unitaires
npm test

# 2. Vérifier l'absence d'erreurs TypeScript
npm run lint

# 3. Vérifier le build de production complet
npm run build
```

---

## 🔀 Workflow Git & Commits Conventionnels

Nous suivons la convention [Conventional Commits](https://www.conventionalcommits.org/) :

* `feat(engine): add broker fee discount for standing >= 8.0`
* `fix(ladder): handle zero volume levels in simulateFill`
* `test(scoring): add edge case tests for 60% ROI scam detection`
* `docs(audit): update formula for player structure broker fees`
* `refactor(advisor): streamline relocation gain evaluation`

---

## 📚 Documentation et synchronisation

Toute modification structurelle ou de contrat doit vérifier `docs/agent/repository_map.md`, `docs/agent/invariants.md` et les documents techniques concernés. `AGENTS.md` est la source de vérité des règles de travail agentiques ; `GEMINI.md` ne définit plus de règles concurrentes.

## 💬 Code de Conduite

Soyez respectueux, constructif et bienveillant envers tous les contributeurs et membres de la communauté.
