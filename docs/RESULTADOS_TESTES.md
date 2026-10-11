# Resultados dos testes de jogabilidade e dificuldade

Bateria automática (`node tests/bots.js 5 todos <dificuldade>`): **24 países × 4 perfis de jogador × 5 sementes = 480 partidas por dificuldade** (1.440 no total), cada uma de 2000 a 2050 com 23 IAs.

Perfis de bot (não são humanos: não erram por distração, mas também não improvisam):
- **Novato:** age em anos alternados com baixa competência e responde aos eventos ao acaso.
- **Médio:** age quase todo ano e escolhe respostas de eventos com ruído.
- **Expert:** competência máxima e escolhe a melhor resposta de cada evento simulando o resultado.
- **Autocrata:** como o Expert, mas adota o regime autoritário no 2º ano.

## Taxa de vitória por dificuldade
| Dificuldade | Novato | Médio | Expert | Autocrata |
|---|---|---|---|---|
| Fácil | 3% | 66% | 92% | 73% |
| Normal | 3% | 44% | 78% | 44% |
| Difícil | 2% | 20% | 48% | 29% |

Objetivo de calibração (Normal): novato ≈ 0-5 %, médio ≈ 40-50 %, expert ≈ 75-80 %. Humanos devem ficar entre o médio e o expert.

## Principais causas de derrota (Normal)
- **novato**: {"eleicao":59,"fim":57}
- **medio**: {"eleicao":15,"fim":52}
- **expert**: {"eleicao":12,"fim":15}
- **autocrata**: {"fim":67}

O jogador novato perde sobretudo nas **eleições** (a cada 4 anos) e por declínio lento; o autocrata nunca perde eleição, mas cresce menos e, no Normal, vence tanto quanto o jogador médio (44 %) e bem menos que o expert (78 %): é uma escolha arriscada, não um atalho.

## Guerra
Guerras (turnos em guerra por partida): 3.73 | partidas com guerra: 57% | desfechos: {"derrota":101,"empate":242,"vitoria":30}

Guerras acontecem em ~57 % das partidas (principalmente invasões de rivais agressivos). Dos 373 desfechos, 65 % foram armistício, 27 % derrota e 8 % vitória: **as guerras defensivas contra rivais mais fortes são uma ameaça real**, e o bot (que só usa uma regra simples de estratégia) raramente as vence. Um jogador humano, que escolhe a ação certa a cada ano, deve se sair melhor; vale observar isso em testes com pessoas.

## Vitórias por país (Normal) — novato / médio / expert / autocrata
| País | Meta | Dif. | Novato | Médio | Expert | Autocrata |
|---|---|---|---|---|---|---|
| Brasil | Top 5 | ★★★ | 0% | 40% | 100% | 80% |
| Índia | Top 2 | ★★★★ | 0% | 80% | 100% | 100% |
| Nigéria | Top 9 | ★★★★★ | 0% | 20% | 20% | 100% |
| Vietnã | Top 8 | ★★★ | 0% | 40% | 60% | 0% |
| Indonésia | Top 4 | ★★★★ | 0% | 80% | 80% | 20% |
| México | Top 6 | ★★★ | 0% | 20% | 80% | 60% |
| Egito | Top 10 | ★★★★ | 0% | 60% | 100% | 60% |
| Bangladesh | Top 9 | ★★★★★ | 0% | 20% | 80% | 0% |
| Filipinas | Top 9 | ★★★★ | 0% | 80% | 60% | 60% |
| Etiópia | Top 15 | ★★★★★ | 0% | 0% | 40% | 0% |
| Turquia | Top 10 | ★★★ | 0% | 20% | 60% | 40% |
| Paquistão | Top 9 | ★★★★★ | 0% | 60% | 80% | 80% |
| Colômbia | Top 9 | ★★★★ | 0% | 0% | 80% | 0% |
| Argentina | Top 10 | ★★★★ | 0% | 20% | 60% | 0% |
| África do Sul | Top 9 | ★★★★ | 0% | 0% | 100% | 0% |
| Rússia | Top 3 | ★★★ | 0% | 0% | 40% | 0% |
| China | Top 1 | ★★ | 40% | 100% | 100% | 100% |
| Japão | Top 5 | ★★★ | 0% | 40% | 100% | 100% |
| Alemanha | Top 3 | ★★ | 40% | 60% | 80% | 40% |
| Estados Unidos | Top 1 | ★ | 0% | 100% | 100% | 80% |
| Reino Unido | Top 6 | ★★ | 0% | 80% | 100% | 40% |
| França | Top 6 | ★★ | 0% | 80% | 80% | 40% |
| Coreia do Sul | Top 6 | ★★ | 0% | 60% | 80% | 20% |
| Arábia Saudita | Top 12 | ★★★ | 0% | 0% | 80% | 40% |

## Conclusões e ajustes feitos a partir dos testes
1. **Antes:** países ricos (EUA, Japão, Reino Unido, França) venciam ~100 % até com bot novato, e jogador médio vencia 72 %. Agora quem já está no topo precisa **manter a posição até 2050**; quem sobe vence ao manter o Top N por 8/10/14 anos.
2. **Saturação:** todos os países chegavam a 100 em tecnologia/infraestrutura. Foram adicionados retornos decrescentes, custo de manutenção crescente e um teto realista para efeitos de leis.
3. **Metas por país** recalibradas (ex.: Etiópia Top 15, Arábia Saudita Top 12, Índia Top 2, Indonésia Top 4).
4. **Dificuldades** com gradiente claro (veja a tabela acima).
5. **Guerra** calibrada para ser decisiva (frente ±100) e menos frequente que no primeiro teste; armistício forçado após 7 anos.
6. **Pontos de atenção:** Etiópia e Arábia Saudita seguem muito difíceis (≤ 40 % mesmo para expert); a partida inteira dura ~50 turnos (sessão longa: o jogo salva automaticamente).
