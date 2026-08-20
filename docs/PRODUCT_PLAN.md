# MyLyfe Modular Life OS

## 1. Proposta De Valor

MyLyfe e um sistema operacional pessoal modular para administrar melhor a vida. Os primeiros modulos ativos sao o Financeiro, que transforma dados em diagnostico e plano, e a Secretaria, que cobra prazos e contas pelo WhatsApp.

O produto nasce preparado para varios modulos dentro do mesmo workspace. Hoje estao ativos o Financeiro e a Secretaria. Rotina, Saude, Casa e Projetos continuam no catalogo como planejados. Cada modulo podera ter pessoas convidadas, papeis e permissoes especificas por area.

O produto nao nasce com valores financeiros do usuario. Idade, renda, patrimonio, dividas, gastos, metas, premissas e familia entram pelo onboarding e podem ser alterados depois. O planejamento e recalculado sempre que a base muda.

## 2. Onboarding

O primeiro acesso tem fluxo de consultoria:

1. Conta e perfil: nome, idade ou nascimento, estado civil e tipo de planejamento.
2. Familia: parceiro, renda, patrimonio, dividas e regras de compartilhamento quando aplicavel.
3. Rendas: multiplas fontes, recorrencia, frequencia, estabilidade e responsavel.
4. Patrimonio: ativos por categoria, liquidez, proprietario e elegibilidade para independencia financeira.
5. Dividas: saldo, parcela, taxa, prazo, data final, credor e responsavel.
6. Gastos: estimativa mensal, provisoes e aporte atual.
7. Objetivos: multiplas metas com prazo, prioridade, inflacao e patrimonio elegivel.
8. Independencia e risco: gasto desejado sem trabalho, idade desejada, premissas e questionario de risco.
9. Diagnostico: score explicavel, metricas principais, pontos fortes e pontos de atencao.

## 3. Modelo De Dados

O MVP usa um workspace MyLyfe por usuario, com um documento financeiro como modulo ativo:

- `workspace`: nome do espaco, dono e catalogo de modulos disponiveis ou planejados.
- `profile`: dados pessoais, familia e regras de compartilhamento.
- `profile.accountLinks`: convites, contas vinculadas e permissoes por modulo.
- `profile.accountLinks.permissions.modules`: papel e areas liberadas dentro de cada modulo.
- `incomeSources`: fontes de renda recorrentes ou extraordinarias.
- `assets`: ativos com categoria, liquidez, proprietario e elegibilidade.
- `debts`: passivos e compromissos mensais.
- `expenseProfile`: estimativas, provisoes e aportes atuais.
- `goals`: objetivos financeiros.
- `budget`: orcamento manual ou sugerido.
- `independence`: premissas de independencia financeira.
- `risk`: respostas e perfil sugerido.
- `transactions`: movimentacoes importadas ou registradas.
- `classificationRules`: aprendizados de classificacao.
- `monthlySnapshots`: historico mensal consolidado.
- `person.phone`: WhatsApp pessoal que recebe os avisos da secretaria.
- Alertas da secretaria (store separado): contas, impostos, assinaturas, recebimentos, documentos, check-ins e lembretes avulsos, com ciclo de lembrete, confirmacao e reagendamento.

## 4. Motor Financeiro

Os calculos ficam em `packages/domain`, fora do React:

- `calculateNetWorth()`
- `calculateInvestableNetWorth()`
- `calculateSavingsRate()`
- `calculateEmergencyFundMonths()`
- `calculateMonthlyInvestmentCapacity()`
- `calculateGoalProjection()`
- `calculateFinancialIndependenceNumber()`
- `calculateRealReturn()`
- `calculateNominalReturn()`
- `simulatePurchaseImpact()`
- `runStressTest()`

Todas as funcoes sao puras, deterministicas e cobertas por testes nos calculos criticos.

## 5. Formulas

- Patrimonio liquido = ativos totais - passivos totais.
- Renda recorrente mensal = soma mensalizada apenas das rendas recorrentes ativas.
- Renda extraordinaria = entradas nao recorrentes, sem contaminar renda mensal.
- Custo de vida = observado dos ultimos meses quando existir; caso contrario, estimativa do usuario.
- Capacidade de investimento = renda recorrente - custo de vida - parcelas - provisoes.
- Taxa de poupanca = aportes realizados / renda liquida recorrente.
- Meses de reserva = reserva de emergencia / custo mensal essencial.
- Retorno real = `(1 + retorno nominal) / (1 + inflacao) - 1`.
- Retorno nominal = `(1 + retorno real) * (1 + inflacao) - 1`.
- Numero de independencia = gasto anual desejado / taxa sustentavel liquida de retirada.
- Projecao patrimonial = juros compostos mensais com aporte, crescimento de aporte e cenarios.

Valores nominais e valores em poder de compra atual sao sempre exibidos separadamente.

## 6. Regras De Classificacao

Uma transacao e classificada por regras do usuario, historico e caracteristicas da transacao:

- `merchant` normalizado.
- descricao.
- valor.
- parcelamento quando disponivel.
- classificacoes anteriores.
- regra manual do usuario.

Estabelecimentos genericos nao recebem uma categoria obrigatoria global. A tela mostra confianca e permite revisao.

## 7. Dashboard

A tela inicial responde:

- patrimonio financeiro;
- patrimonio total;
- renda mensal;
- gasto do mes;
- orcamento;
- aporte;
- taxa de poupanca;
- meta principal e prazo estimado;
- score financeiro explicavel;
- pontos fortes e pontos de atencao;
- evolucao patrimonial e projecoes por cenario.

## 8. Importacao

O MVP aceita importacao de fatura/extrato por CSV e prepara o fluxo para PDF. A importacao complementa o planejamento, mas nao assume que fatura e gasto real. Cada transacao pode ser marcada como pessoal, empresa, terceiros ou reembolsavel, alem de natureza e categoria.

## 9. Edge Cases

- Renda zero ou renda temporariamente perdida.
- Gasto observado maior que renda.
- Dividas sem taxa ou prazo.
- Ativos iliquidos compondo patrimonio total, mas nao independencia.
- Casal com patrimonio separado e despesas em proporcoes diferentes.
- Metas sem prazo.
- Objetivos concorrentes.
- Transacoes duplicadas.
- Merchants genericos com multiplos usos.
- Patrimonio negativo.
- Aporte atual maior que capacidade potencial.
- Premissas de retorno ou inflacao nulas.

## 10. MVP E Futuro

MVP:

- workspace MyLyfe com catalogo de modulos;
- Financeiro e Secretaria como modulos ativos e independentes;
- Secretaria com WhatsApp, lembretes, preferencias e confirmacao de pagamento;
- onboarding em etapas;
- convite para pessoa vinculada ao modulo financeiro;
- papel e areas acessiveis definidos no convite;
- divisao de despesas compartilhadas definida no convite quando aplicavel;
- titularidade e visibilidade privada/compartilhada para rendas, ativos e dividas;
- CRUD local via API para plano financeiro;
- motor financeiro compartilhado;
- diagnostico explicavel;
- dashboard responsivo;
- importacao CSV;
- classificacao com aprendizado simples;
- projecoes, simulador "Posso gastar?" e testes de estresse;
- snapshots mensais.

Futuro:

- autenticacao real;
- contas de usuario reais com sessoes separadas, RBAC por workspace/modulo e aceite seguro de convites;
- novos modulos: Rotina, Saude, Casa e Projetos;
- PostgreSQL ativo em producao;
- conectores Open Finance;
- parser PDF bancario avancado;
- reconciliacao automatica de investimentos;
- convites e permissoes tambem no modulo Secretaria;
- multiusuario familiar;
- recomendacoes fiscais e previdenciarias com compliance.
