# taskboard

Painel de terminal que mostra, sempre visível, as tasks das sessões abertas do Claude Code. Uma seção por sessão (pasta + branch), lista numerada, concluída fica riscada.

```
╭─ adaptive-learning-novo  (feat/analytics)  ·  2min ─────╮
│  ● 1. Atualizar PR                                      │
│  ◐ 2. Revisar PR                                        │
│  ○ 3. Pedir artefato                                    │
╰──────────────────────────────────────────────── 1/3 ─────╯
```

## Como funciona

Sem hook. O Claude Code já grava tudo que o painel precisa:

- `~/.claude/sessions/<pid>.json`: sessões vivas, com `sessionId`, `cwd`, nome, tipo (`interactive` ou `bg`) e `busy`/`idle`. O painel confere se o pid ainda existe.
- `~/.claude/tasks/<sessionId>/N.json`: uma task por arquivo, com id, título e status reais. Sessões retomadas ou em background recebem uma cópia da lista, cada uma com o próprio diretório.

Terminal (`src/taskboard/`) e app (`app/`, Electron, mesmo padrão de janela do Clauddy) são duas camadas de exibição sobre esses dois diretórios, relidos a cada segundo. A branch vem de `git branch --show-current` no `cwd` da sessão, com cache de 10s.

Duas peças de configuração continuam necessárias:

1. `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` no `env` do `~/.claude/settings.json`, que liga as Task tools nos modelos novos.
2. Regra no `~/.claude/AGENTS.md` pedindo ao Claude que registre próximos passos com `TaskCreate`. Sem isso o painel fica vazio, porque o modelo só cria tasks espontaneamente em plan mode ou com subagentes.

## Uso

Duas formas de ver, lendo os mesmos JSONs:

**App flutuante** (`/Applications/Taskboard.app`): janela sem moldura, sempre por cima, visível em todos os desktops. Arrasta pelo cabeçalho. `▾` recolhe pra uma linha só com o resumo (duplo clique no cabeçalho faz o mesmo), `◷` mostra também sessões já encerradas que deixaram tasks, `×` fecha. Clique no nome de uma sessão recolhe só ela (fica o contador e a task em andamento). A janela cresce até 520px e a partir daí o corpo rola. Posição, modo e sessões recolhidas ficam salvos.

O `.app` sai com assinatura ad-hoc (`codesign --sign -`), suficiente pra rodar neste Mac. Pra distribuir em outro Mac sem aviso do Gatekeeper precisaria de Developer ID e notarização, que exigem conta Apple Developer. Rebuild com `app/install.sh`; pra desenvolver, `cd app && npm start`.

**Terminal** (`taskboard`):

```bash
taskboard            # painel vivo, só sessões abertas
taskboard --all      # inclui sessões encerradas
taskboard --once     # renderiza uma vez e sai
```

Instalado com `uv tool install --editable ~/dev/taskboard`. Pra desenvolver: `uv sync` e `uv run --no-env-file taskboard`.

## Depois (de propósito fora da v1)

- Tasks por pasta em vez de por sessão, sobrevivendo ao fim da sessão.
- Agrupar por projeto.
