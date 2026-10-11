# 👑 Empire Game

Jogo de **estratégia em tempo real e gestão de recursos/economia de sociedades**, inspirado em *Age of Empires II*.
Roda 100 % **offline no navegador** (HTML5 Canvas + JavaScript puro) — sem instalação, sem dependências, sem servidor.

> Abra o arquivo **`index.html`** em qualquer navegador moderno (Chrome, Edge, Firefox, Safari) e jogue.

## Como jogar

**Objetivo:** coletar recursos, construir e expandir sua cidade, pesquisar tecnologias, avançar de era,
formar exércitos e derrotar os impérios rivais (controlados pelo computador). Você pode jogar sozinho
contra IAs ou em **cooperação (COOP)** com aliados da IA contra as demais equipes.

### Mecânicas (como no AoE II)
| Tema | O que existe |
|---|---|
| **Recursos** | 🍖 Comida, 🪵 Madeira, 🪙 Ouro, 🪨 Pedra — coletados por **Aldeões** e entregues no Centro da Cidade, Moinho, Serraria ou Acampamento de Mineração |
| **4 Eras** | Idade das Trevas → Feudal → dos Castelos → Imperial (custos, tempos e pré-requisitos de construção, como no original) |
| **Economia** | Fazendas (replantio automático), frutas, caça, casas/população (máx. 200), Mercado (compra/venda dinâmica), melhorias de coleta |
| **Militar** | Milícia→Espadachim, Lanceiro→Piqueiro, Arqueiro→Besteiro, Escaramuçador, Cavalaria→Cavaleiro, Aríete, Mangonel; triângulo de counters (lanceiro > cavalaria > arqueiro > infantaria) |
| **Tecnologias** | 40+ pesquisas: Ferraria (ataque/armadura), economia, evolução de unidades, defesas |
| **Civilizações** | **16 civs**, cada uma com 3 bônus e uma **unidade única** treinada no Castelo (Britões, Francos, Mongóis, Chineses, Godos, Persas, Turcos, Japoneses, Vikings, Teutões, Espanhóis, Bizantinos, Sarracenos, Celtas, Astecas, Maias) |
| **Mapa** | Gerado proceduralmente: Planície, Terra dos Lagos, Floresta Negra, Continente; 4 tamanhos; neblina de guerra; minimapa |
| **Modos** | **Conquista**, **Regicida** (proteja seu Rei), **Mata-Mata / Death Match** (recursos enormes) |
| **Campanha / Tutorial** | Campanha em 4 capítulos e o tutorial guiado **"A Arte da Guerra"** |
| **IA** | 4 níveis (Fácil, Moderada, Difícil, Especialista): economia, construção, pesquisa, ondas de ataque, defesa e aliados |

### Controles
| Ação | Controle |
|---|---|
| Selecionar / caixa de seleção | Clique esquerdo / arrastar · duplo clique = todos do mesmo tipo na tela |
| Mover, atacar, coletar, construir, reparar, ponto de encontro | **Clique direito** (contextual) · `Shift` enfileira ordens |
| Painel de comandos | Botões ou teclas em grade `Q W E R T / A S D F G / Z X C V B` |
| Treinar em lote | `Shift` + botão da unidade (×5) |
| Aldeão / soldado ocioso · Centro da Cidade | `.` · `,` · `H` |
| Grupos de controle | `Ctrl`+`1-9` cria · `1-9` seleciona (2× centraliza) |
| Câmera | Setas, bordas da tela, botão do meio, roda do mouse (zoom), minimapa, `Espaço` (último alerta) |
| Pausa · velocidade · menu · excluir | `P` · `+`/`-` · `Esc` · `Del` |

## Estrutura do código
```
index.html        página única (menus + jogo)
css/style.css     interface
js/util.js        utilitários (RNG, heap, grade espacial)
js/data.js        eras, unidades, construções, tecnologias, civilizações, dificuldades
js/map.js         mundo/tiles, geração procedural, pathfinding A*
js/game.js        núcleo: jogadores, economia, produção, visão, vitória
js/units.js       ordens, movimento, combate, coleta, construção
js/ai.js          IA do computador
js/render.js      renderização isométrica (sprites procedurais)
js/ui.js          HUD, minimapa, seleção, comandos
js/audio.js       efeitos sonoros sintetizados (WebAudio)
js/main.js        menus, campanha, tutorial, laço principal
tests/            simulação headless e testes de navegador (Playwright)
```
Tudo é dirigido por dados (`data.js`): adicionar uma civilização, unidade ou tecnologia é editar tabelas.

## Testes (opcional)
```bash
node tests/sim.js 30 small conquest arabia hard   # simula IA vs IA sem navegador
node tests/api.js                                 # testa comandos do jogador via API
PW=<caminho do playwright> node tests/browser.js  # navegador headless + screenshots
```

## Roadmap / ideias
Guarnição em edifícios, muralhas, naval, monges e relíquias, Maravilha como condição de vitória,
salvar/carregar partida, mais civilizações e mapas.
