#!/usr/bin/env bash
# Двухремотный поток: приватный репозиторий — истина, GitHub — генерируемое очищенное зеркало.
#
#   ./.ai/sync.sh backup   — закоммитить ИИ-слой и отправить ВСЁ в приватный origin
#   ./.ai/sync.sh publish  — собрать очищенную историю и отправить её в public (GitHub)
#   ./.ai/sync.sh check    — сухой прогон publish: собрать зеркало и показать, что в нём окажется
#
# Почему так, а не «фильтр при пуше»: коммит — это его содержимое, поэтому «те же коммиты
# минус файлы» не существует. Зеркало собирается заново из приватной истории и остаётся
# ДЕТЕРМИНИРОВАННЫМ: одинаковый вход → одинаковые хеши → в GitHub уходит fast-forward, а не
# force-push. Условие детерминизма: BASE и список путей ниже НИКОГДА не меняются.
set -euo pipefail

# Последний коммит, уже опубликованный в GitHub на момент введения этой схемы. Точка сращивания:
# всё до неё не переписывается вообще, поэтому публичные хеши сохраняются навсегда.
BASE=bd1c073c0051395375ee0f362a180fff05e20a84

# Пути ИИ-слоя: отслеживаются в приватном репозитории, вырезаются из зеркала.
AI_PATHS=(forge-wiki .wolf .claude .impeccable .omc .ai CLAUDE.md)
# AGENTS.md на любой глубине (корневой + пакетные) — регуляркой, чтобы не зависеть от семантики glob.
AI_REGEX='(^|/)AGENTS\.md$'

REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

filter_args=(--force --refs "$BASE..main" --prune-empty always --invert-paths --path-regex "$AI_REGEX")
for p in "${AI_PATHS[@]}"; do filter_args+=(--path "$p"); done

build_mirror() {
  local mirror=$1
  rm -rf "$mirror"
  git clone --quiet --no-local --branch main "$REPO" "$mirror"
  git -C "$mirror" filter-repo "${filter_args[@]}" >/dev/null
}

case "${1:-}" in
backup)
  # -f обязателен: ИИ-слой перечислен в .gitignore, чтобы никогда не попасть в публичный репозиторий.
  # На отслеживаемые файлы игнор не влияет, так что версионируется всё.
  git add -f "${AI_PATHS[@]}" 2>/dev/null || true
  git add -u
  if git diff --cached --quiet; then
    echo "нечего коммитить"
  else
    git commit -q -m "${2:-chore(ai): snapshot ai layer}"
    echo "закоммичено: $(git log -1 --format='%h %s')"
  fi
  git push --quiet origin main
  echo "отправлено в приватный origin: $(git remote get-url origin)"
  ;;

publish)
  mirror=$(mktemp -d)
  build_mirror "$mirror"
  git -C "$mirror" remote add public "$(git remote get-url public)"
  git -C "$mirror" push public main
  echo "опубликовано в $(git remote get-url public): $(git -C "$mirror" log -1 --format='%h %s')"
  rm -rf "$mirror"
  ;;

check)
  mirror=$(mktemp -d)
  build_mirror "$mirror"
  echo "=== точка сращивания сохранена? ==="
  git -C "$mirror" cat-file -e "$BASE" && echo "да, $BASE на месте (публичные хеши целы)"
  echo "=== коммиты зеркала после точки сращивания ==="
  git -C "$mirror" log --oneline "$BASE..main"
  echo "=== утечки ИИ-слоя в зеркале (должно быть пусто) ==="
  git -C "$mirror" log --all --name-only --format='' | sort -u |
    grep -E "^(forge-wiki|\.wolf|\.claude|\.impeccable|\.omc|\.ai)/|(^|/)AGENTS\.md$|^CLAUDE\.md$" || echo "чисто"
  echo "=== вершина зеркала: файлов в дереве ==="
  git -C "$mirror" ls-tree -r --name-only main | wc -l
  echo "(зеркало осталось в $mirror — удали вручную: rm -rf $mirror)"
  ;;

*)
  sed -n '2,8p' "$0"
  exit 1
  ;;
esac
