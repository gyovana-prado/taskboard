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

Hook escreve → JSON por sessão → painel lê. Terminal (`src/taskboard/`) e app (`app/`, Electron, mesmo padrão de janela do Clauddy) são só duas camadas de exibição sobre a mesma pasta.

1. **Hooks** no `~/.claude/settings.json`: `PostToolUse` em `TaskCreate|TaskUpdate`, mais `SessionStart` e `SessionEnd`. Cada evento roda `src/taskboard/hook.py` (só stdlib), que atualiza `~/.claude/taskboard/sessions/<session_id>.json`.
2. **Painéis** releem essa pasta a cada segundo: o de terminal desenha com `rich`, o app com HTML.
3. **Regra** no `~/.claude/AGENTS.md` pedindo ao Claude que registre próximos passos com `TaskCreate`. Sem isso o painel fica vazio, porque o modelo só cria tasks espontaneamente em plan mode ou com subagentes.

A env `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` (também na settings) é o que liga as Task tools nos modelos novos.

## Uso

Duas formas de ver, lendo os mesmos JSONs:

**App flutuante** (`/Applications/Taskboard.app`): janela sem moldura, sempre por cima, visível em todos os desktops. Arrasta pelo cabeçalho. `▾` recolhe pra uma linha só com o resumo (duplo clique no cabeçalho faz o mesmo), `◷` mostra também sessões encerradas, `×` fecha. Posição e modo ficam salvos. Rebuild com `app/install.sh`; pra desenvolver, `cd app && npm start`.

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
- Detectar sessão morta sem `SessionEnd` (hoje fica "aberta" até alguém limpar o JSON).
