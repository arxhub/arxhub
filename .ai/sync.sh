#!/usr/bin/env bash
# Двухремотный поток: приватный origin — истина, GitHub (public) — генерируемое очищенное зеркало.
#
#   ./.ai/sync.sh backup [сообщение]  — закоммитить ИИ-слой и отправить ВСЁ в приватный origin
#   ./.ai/sync.sh check               — сухой прогон: собрать зеркало и доказать, что ИИ-слоя в нём нет
#   ./.ai/sync.sh publish             — собрать зеркало и отправить его в public (GitHub)
#
# Почему зеркало пересобирается, а не «фильтруется при пуше»: коммит — это его содержимое,
# поэтому «те же коммиты минус файлы» не существует. Фильтр детерминирован (одинаковый вход →
# одинаковые хеши), так что после первой публикации GitHub получает обычные fast-forward пуши.
# Условие детерминизма: список путей ниже НЕ меняется, а приватная история НЕ переписывается.
#
# ВАЖНО: фильтр проходит по ВСЕЙ истории, потому что AGENTS.md и CLAUDE.md лежали в публичных
# коммитах с самого начала. Частичное переписывание (--refs) их не убирает: git fast-export отдаёт
# дельты, поэтому вырезаются только пути, которых касаются коммиты диапазона, а унаследованные из
# базы файлы остаются в дереве. Цена полного фильтра — хеши публичной истории меняются один раз
# (первый publish делает force-push). Оригинальные хеши навсегда остаются в приватном origin.
set -euo pipefail

# Пути ИИ-слоя: отслеживаются в приватном репозитории, вырезаются из зеркала.
AI_PATHS=(forge-wiki .wolf .claude .impeccable .omc .ai CLAUDE.md)
# AGENTS.md на любой глубине (корневой + пакетные) — регуляркой, а не glob, чтобы не зависеть от
# того, матчит ли `*` символ `/`.
AI_REGEX='(^|/)AGENTS\.md$'

REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

filter_args=(--force --prune-empty always --invert-paths --path-regex "$AI_REGEX")
for p in "${AI_PATHS[@]}"; do filter_args+=(--path "$p"); done

leak_grep='^(forge-wiki|\.wolf|\.claude|\.impeccable|\.omc|\.ai)/|(^|/)AGENTS\.md$|^CLAUDE\.md$'

build_mirror() {
  local mirror=$1
  rm -rf "$mirror"
  git clone --quiet --no-local "$REPO" "$mirror"
  git -C "$mirror" filter-repo "${filter_args[@]}" >/dev/null
}

case "${1:-}" in
backup)
  # -f обязателен: ИИ-слой перечислен в .gitignore, чтобы никогда не уехать в публичный репозиторий.
  # На уже отслеживаемые файлы игнор не влияет, поэтому версионируется всё.
  for p in "${AI_PATHS[@]}"; do [ -e "$p" ] && git add -f "$p"; done
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

check)
  mirror=$(mktemp -d)
  build_mirror "$mirror"
  echo "=== ИИ-слой в вершине main (должно быть 0) ==="
  git -C "$mirror" ls-tree -r --name-only main | grep -cE "$leak_grep" || true
  echo "=== ИИ-слой во ВСЕЙ истории зеркала (должно быть 0) ==="
  git -C "$mirror" log --all --name-only --format='' | sort -u | grep -cE "$leak_grep" || true
  echo "=== коммитов в зеркале / в приватном репозитории ==="
  echo "$(git -C "$mirror" rev-list --count main) / $(git rev-list --count main)"
  echo "=== вершина зеркала ==="
  git -C "$mirror" log -1 --format='%h %s' main
  rm -rf "$mirror"
  ;;

publish)
  mirror=$(mktemp -d)
  build_mirror "$mirror"
  leaks=$(git -C "$mirror" log --all --name-only --format='' | sort -u | grep -cE "$leak_grep" || true)
  if [ "$leaks" != "0" ]; then
    echo "ОТКАЗ: в зеркале $leaks путей ИИ-слоя — публикация отменена"; rm -rf "$mirror"; exit 1
  fi
  git -C "$mirror" remote add public "$(git remote get-url public)"
  # --force: зеркало пересобирается с нуля, поэтому первый пуш переписывает публичную историю,
  # а последующие являются fast-forward (фильтр детерминирован).
  git -C "$mirror" push --force public main
  echo "опубликовано в $(git remote get-url public): $(git -C "$mirror" log -1 --format='%h %s' main)"
  rm -rf "$mirror"
  ;;

*)
  sed -n '2,6p' "$0"
  exit 1
  ;;
esac
