# 🌍 Nação em Ascensão

Simulador de **gestão de países por turnos**, jogável no celular e no computador, 100 % offline (HTML/JS puro).
Você governa um país real entre **2000 e 2050**, equilibra economia, sociedade e política, enfrenta crises e tenta levá-lo ao grupo das grandes potências — enquanto 23 outros países também evoluem.

> Abra **`index.html`** em qualquer navegador moderno.

## Como jogar
1. Escolha um país (comece pelos em desenvolvimento) e leia o briefing dos conselheiros.
2. A cada ano ajuste o **Orçamento** (impostos e 7 áreas de gasto), aprove **Leis** (custam ⭐ capital político) e toque em **Próximo ano**.
3. Leia o **jornal**, decida os **eventos** (cada escolha tem ônus e bônus) e acompanhe as **facções**.
4. A cada 4 anos há **eleição**. Perder = fim de jogo. Golpes, colapso e falência também derrotam.
5. **Vitória:** ficar no Top N do ranking de poder (N depende do país) por 6 anos seguidos.

## Principais sistemas
Demografia (3 faixas etárias, natalidade, mortalidade, migração) · economia (convergência por tecnologia/educação/infraestrutura, commodities, comércio, choques globais) · finanças (impostos, previdência, juros, dívida, rating) · social (desigualdade, pobreza, crime, corrupção, poluição) · 6 facções com democracia e eleições · 34 leis com efeito atrasado · 30 eventos · diplomacia (acordos comerciais e transferência de tecnologia) · 23 IAs seguindo as mesmas regras.

Veja `docs/GAME_DESIGN.md` para o planejamento completo.

## Estrutura
```
index.html, css/style.css
js/data.js    países, facções, leis, conselheiros
js/sim.js     simulação (economia, demografia, política, mundo, IA)
js/events.js  eventos narrativos e choques globais
js/game.js    turnos, jornal, conselheiros, salvar/carregar
js/ui.js      interface mobile-first
tests/        simulação headless e testes de navegador
```

## Testes
```bash
node tests/sim.js 1 ai BR             # mundo inteiro simulado (o país escolhido governado pela IA)
PW=<caminho do playwright> node tests/check.js   # fluxo de telas no celular + screenshots
PW=<caminho do playwright> node tests/full.js IN # partida completa automática
```
