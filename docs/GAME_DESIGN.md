# Fazenda Império — design

## Ciclo do jogo
1 turno = 1 dia (30 dias/mês, 12 meses/ano). O jogador avança dia a dia, 7 dias ou em tempo automático.

Plantar/criar → colher/produzir → estocar (capacidade e perdas) → negociar (cidade, país, mundo) →
receber (à vista ou a prazo) → pagar custos fixos no fim do mês → investir ou quitar dívidas.

## Economia
- Lote = 1 ha. Custo de implantação escala com dólar (adubo importado) e inflação.
- Lucro típico de uma lavoura: R$ 110–170/dia por lote; custo fixo inicial ≈ R$ 2.600/mês.
- Funcionário: R$ 2.100/mês, cobre 4 lotes. O agricultor cobre 3.
- Preço da cidade = preço nacional × (1 − 0,35 × saturação). Saturação cresce com as vendas e decai 7%/dia.
- Preço nacional de commodities = cotação US$ × dólar^0,9 × fator de safra; demais produtos seguem o ciclo de safra.
- Frete = viagens × km (ida e volta na frota própria) × custo/km (parte indexada ao diesel) + taxa fixa (terceirizado).

## Negociação
Pedido: quantidade, oferta (90–98% do mercado × perfil), limite oculto (oferta + 3–19% conforme dureza e
relacionamento), prazo e prazo de pagamento. Proposta ≤ limite → aceite. Acima → contraproposta que se
aproxima do limite a cada rodada. Acima de 30% ou rodadas esgotadas → desistência e queda de relacionamento.
Entregas parciais (≥40%) reduzem o limite em até 6%.

## Progressão
Nível por receita acumulada (R$ 40 mil, 120 mil, 300 mil, 600 mil…). Desbloqueia culturas, criações,
agroindústria, veículos, compradores industriais, distribuidoras nacionais (nível 3) e exportação (nível 5).

## Falência
Estouro do limite do cheque especial (R$ 20 mil + 5% dos ativos) ou 60 dias seguidos com caixa negativo.

## Equilíbrio (tests/bots.js, 720 dias)
- Bot com boa gestão: 0 falências, patrimônio médio ≈ R$ 510 mil, nível 6, ~35 lotes.
- Bot parado: falência em ~480 dias. Bot imprudente (gasta sem vender): falência em ~30 dias.
