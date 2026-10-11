# Nação em Ascensão — Documento de Design (MVP)

Simulador de gestão de países. O jogador governa uma nação real, em desenvolvimento ou não, entre **2000 e 2050**,
e precisa levá-la ao grupo das grandes potências enquanto os demais países também evoluem.

## Decisões de design (confirmadas)
| Tema | Decisão |
|---|---|
| Ritmo | **Por turnos**: 1 turno = 1 ano (50 turnos). Mobile pede sessões curtas, então o trimestre ficou de fora. |
| Países | **Reais** (24, dados de 2000 aproximados e simplificados para o jogo) |
| Política | **Democracia + facções já no MVP**: 6 facções, aprovação, eleições a cada 4 anos, golpes e protestos |
| Tom | **Narrativo**: jornal anual, conselheiros com opinião própria e eventos com escolhas |
| Plataforma | **Mobile e desktop**, offline, HTML/JS puro, interface *mobile-first* |

## Objetivo e fim de jogo
- **Índice de Poder Nacional** = PIB (40 %) + tecnologia (20 %) + força militar (15 %) + influência (10 %) + qualidade de vida (15 %).
- **Meta** por país (ex.: Brasil Top 5, Etiópia Top 12): ficar na meta por **5 anos seguidos** vence o jogo.
- **Derrota:** perder a eleição, golpe de Estado, colapso (estabilidade zerada) ou falência.
- Em 2050, sem vitória antecipada, o resultado é uma classificação: Potência emergente / regional / grande potência / superpotência.

## Sistemas
- **Demografia:** 3 coortes (0-14, 15-64, 65+); natalidade cai com educação, renda e urbanização; mortalidade depende de saúde; migração.
- **Economia:** convergência para um PIB per capita potencial definido por tecnologia, educação, infraestrutura, saúde e instituições; choques globais, commodities, inflação, comércio.
- **Finanças:** impostos, 7 áreas de gasto, previdência (cresce com o envelhecimento), juros, dívida e *rating*.
- **Social:** desigualdade, pobreza, crime, corrupção, poluição, empregos.
- **Política:** facções (Trabalhadores, Empresariado, Militares, Tradicionalistas, Rural, Jovens Urbanos), aprovação, estabilidade, **capital político** (limita as ações por turno).
- **Políticas (cartas):** 34 leis com custo, efeito **atrasado** que sobe aos poucos, efeito colateral e reação das facções.
- **Eventos:** crises e oportunidades com escolhas de ônus e bônus.
- **Mundo:** 23 IAs usando as mesmas regras, preços de commodities, crises globais, acordos comerciais e transferência de tecnologia.

## Fora do MVP (próximas fases)
Guerra e camada tática, regimes autoritários, sanções e alianças, cenários históricos (outras épocas), multi-idioma.
