# 🌾 Fazenda Império

Simulador de administração de fazenda em HTML/JavaScript puro (sem dependências).
Você começa com 9 lotes, uma picape e R$ 40 mil, produz, negocia com a cidade grande
e acompanha o mercado do país e do mundo. Sem demanda ou sem lucro, a fazenda vai à falência.

## Como jogar

- **Jogo:** abra `index.html` no navegador.
- **Painel de testes:** abra `teste.html` — roda a bateria automática, traz um roteiro
  guiado (cada botão prepara um cenário e abre a tela certa) e um sandbox com atalhos
  (dinheiro, nível, eventos, avançar 1 ano, forçar falência…). O sandbox salva separado do jogo.
- **Testes no terminal:** `node tests/run.js` (35 testes) e `node tests/bots.js 20`
  (estatísticas de equilíbrio com bots inteligente, parado e imprudente).

## Visões

| Aba | O que mostra |
|---|---|
| 🏡 Fazenda | Mapa 8×8 de lotes: plantar, construir, colher, comprar terra vizinha. Estoque, mão de obra, criação e frota. |
| 🏙️ Cidade | Mapa da metrópole (1,06 mi hab.) com bairros coloridos pela demanda de cada produto, compradores e pedidos, preços e saturação. |
| 🤝 Negócios | Pedidos abertos, contratos, recebíveis e venda rápida na Ceasa. Negociação com cotação completa. |
| 🇧🇷 País | Preços por região, dólar, Selic, inflação, diesel e pedidos de distribuidoras de outras regiões (nível 3+). |
| 🌎 Mundo | Blocos importadores/exportadores, cotações em US$, notícias de choques globais e exportação (nível 5 + licença). |
| 💰 Finanças | DRE mensal, caixa × patrimônio, balanço, custos fixos, empréstimos e risco de falência. |
| 📜 Diário | Metas e histórico de eventos. |

## Regras principais

- **Produção:** 8 lavouras (2 perenes), 4 criações, silo, câmara fria, irrigação, estufa, moinho e laticínio.
  Estações mudam a produtividade e o preço (safra × entressafra).
- **Mão de obra:** cada lavoura/instalação exige trabalho; faltando gente, a produção cai.
- **Negociação:** o comprador tem um preço-limite oculto que depende do perfil (paga acima/abaixo do mercado,
  dureza) e do relacionamento. A cotação mostra receita, impostos (4,5%), frete (viagens × km × diesel),
  custo de produção, lucro, margem, preço mínimo e quanto cobre dos custos fixos. Pedir demais gera
  contraproposta; exagerar ou insistir faz o comprador desistir.
- **Contratos:** entrega semanal a preço fixo; faltar produto custa 15% de multa e, na 2ª falha, o contrato.
- **Mercado:** vender muito satura a cidade e derruba o preço local. Grãos, café, laranja e carne seguem a
  cotação internacional × dólar; eventos (seca nos EUA, China comprando, guerra, supersafra…) mexem nos preços.
- **Falência:** custos fixos no fim do mês; caixa negativo entra no cheque especial (~8% a.m.).
  Falência ao estourar o limite ou após 60 dias seguidos no vermelho.

## Estrutura

```
index.html       jogo
teste.html       painel de testes (bateria + roteiro + sandbox)
css/style.css    estilos (claro/escuro, responsivo)
js/data.js       catálogos: produtos, lavouras, animais, construções, bairros, regiões, blocos, eventos
js/engine.js     motor de simulação puro (sem DOM, determinístico por semente)
js/charts.js     gráficos SVG
js/ui.js         interface
tests/           suite.js (Node + navegador), run.js, bots.js
docs/GAME_DESIGN.md
```
