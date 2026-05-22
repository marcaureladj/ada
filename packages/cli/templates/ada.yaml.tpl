project:
  name: MyApp
  url: https://mon-app.com
  language: fr
  description: |
    Décrivez ici brièvement votre produit : à qui il s'adresse,
    son cœur de valeur, et le parcours typique d'un nouvel utilisateur.

auth:
  type: credentials # credentials | api_key | signup | none
  email: demo@test.com
  password: ${SECRET_PASSWORD} # interpolé depuis l'environnement

scenarios:
  - id: signup
    description: Création d'un nouveau compte
  - id: create-project
    description: Création d'un projet depuis le dashboard
    preconditions: [signup]

output:
  format: mp4
  resolution: 1080p
  ratio: '16:9'
  template: framed # classic | framed | split | social
  path: ./demo.mp4

providers:
  vision: claude-computer-use
  text: claude
  tts: elevenlabs
  voice: french-pro-male

hyperframes:
  catalog: [] # ex: [data-chart, instagram-follow]
  shaderTransitions: true
