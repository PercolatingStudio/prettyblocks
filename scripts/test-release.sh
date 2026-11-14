#!/usr/bin/env bash
set -Eeuo pipefail

script_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_dir=$(dirname "$script_dir")
compose_files=(
  -f "$project_dir/docker/compose.yml"
  -f "$project_dir/docker/compose.release-test.yml"
)

version=$(awk -F"'" '/\$this->version[[:space:]]*=/{print $2; exit}' "$project_dir/prettyblocks.php")
expected_archive_name="prettyblocks-${version}.zip"

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [archive]" >&2
  exit 1
fi

if [ "$#" -eq 1 ]; then
  archive_path=$1
  if [ ! -f "$archive_path" ]; then
    echo "Release archive not found: $archive_path" >&2
    exit 1
  fi

  archive_dir=$(CDPATH='' cd -- "$(dirname -- "$archive_path")" && pwd)
  archive_path="$archive_dir/$(basename -- "$archive_path")"
else
  "$script_dir/build-release.sh"
  archive_path="$project_dir/dist/$expected_archive_name"
fi

if [ "$(basename -- "$archive_path")" != "$expected_archive_name" ]; then
  echo "Expected release archive name: $expected_archive_name" >&2
  exit 1
fi

export PRETTYBLOCKS_RELEASE_ARCHIVE_PATH="$archive_path"
export COMPOSE_PROJECT_NAME="${PRETTYBLOCKS_TEST_PROJECT:-prettyblocks-release-test-${$}}"
export PS82_PORT=${PS82_RELEASE_PORT:-8182}
export PS91_PORT=${PS91_RELEASE_PORT:-8191}

test_log_dir=''
if [[ -n ${PRETTYBLOCKS_TEST_LOG_DIR:-} ]]; then
  mkdir -p -- "$PRETTYBLOCKS_TEST_LOG_DIR"
  test_log_dir=$(CDPATH='' cd -- "$PRETTYBLOCKS_TEST_LOG_DIR" && pwd)
  if [[ ! -w $test_log_dir ]]; then
    echo "Release test log directory is not writable: $test_log_dir" >&2
    exit 1
  fi
fi

copy_container_logs() {
  local service=$1
  local container_id=$2
  local remote_path=$3
  local destination_name=$4
  local service_log_dir="$test_log_dir/$service"
  local destination="$service_log_dir/$destination_name"

  mkdir -p -- "$destination"
  if ! docker cp \
    "${container_id}:${remote_path}/." \
    "$destination/" \
    >"$service_log_dir/${destination_name}.copy.log" 2>&1; then
    rmdir "$destination" >/dev/null 2>&1 || true
  fi
}

collect_test_artifacts() {
  local status=$1
  local service
  local container_id

  [[ -n $test_log_dir ]] || return 0

  {
    printf 'status=%s\n' "$status"
    printf 'project=%s\n' "$COMPOSE_PROJECT_NAME"
    printf 'archive=%s\n' "$PRETTYBLOCKS_RELEASE_ARCHIVE_PATH"
    printf 'ps82_port=%s\n' "$PS82_PORT"
    printf 'ps91_port=%s\n' "$PS91_PORT"
    printf 'captured_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  } >"$test_log_dir/run.txt"

  docker compose "${compose_files[@]}" ps --all \
    >"$test_log_dir/compose-ps.txt" 2>&1 || true
  docker compose "${compose_files[@]}" logs --no-color --timestamps \
    >"$test_log_dir/compose.log" 2>&1 || true

  for service in ps82 ps91; do
    mkdir -p -- "$test_log_dir/$service"
    docker compose "${compose_files[@]}" logs --no-color --timestamps "$service" \
      >"$test_log_dir/$service/compose.log" 2>&1 || true

    container_id=$(
      docker compose "${compose_files[@]}" ps -aq "$service" 2>/dev/null \
        | head -n 1 || true
    )
    if [[ -z $container_id ]]; then
      continue
    fi

    docker inspect "$container_id" \
      >"$test_log_dir/$service/container-inspect.json" 2>&1 || true
    copy_container_logs \
      "$service" "$container_id" /var/www/html/var/log var-log
    copy_container_logs \
      "$service" "$container_id" /var/www/html/var/logs var-logs
  done
}

cleanup() {
  local status=$?

  trap - EXIT HUP INT TERM
  collect_test_artifacts "$status" || true
  if [[ -n $test_log_dir ]]; then
    echo "Release test artifacts saved to: $test_log_dir"
  fi

  if [ "$status" -ne 0 ]; then
    echo "Release test failed; PrestaShop logs follow:" >&2
    docker compose "${compose_files[@]}" logs --no-color ps82 ps91 >&2 || true
  fi

  if [ "$status" -eq 0 ] && [ "${PRETTYBLOCKS_KEEP_STACK:-0}" = "1" ]; then
    echo "Release test stack kept: $COMPOSE_PROJECT_NAME"
    echo "PrestaShop URLs: http://localhost:${PS82_PORT} and http://localhost:${PS91_PORT}"
  else
    docker compose "${compose_files[@]}" down -v --remove-orphans \
      >/dev/null 2>&1 || true
  fi

  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Installing the packaged ZIP on clean PrestaShop 8.2 and 9.1 stacks..."
docker compose "${compose_files[@]}" up \
  --build \
  --detach \
  --wait \
  --wait-timeout "${PRETTYBLOCKS_WAIT_TIMEOUT:-600}"

"$project_dir/docker/scripts/smoke-test.sh"

for service in ps82 ps91; do
  for fixture_and_target in \
    'field-fileupload-test:classes/prettyblocks/core/FieldCore.php' \
    'date-field-test:classes/prettyblocks/core/FieldCore.php' \
    'editor-cache-test:prettyblocks.php'; do
    fixture=${fixture_and_target%%:*}
    target=${fixture_and_target#*:}
    docker compose "${compose_files[@]}" cp \
      "$project_dir/tests/${fixture}.php" "$service:/tmp/prettyblocks-${fixture}.php"
    docker compose "${compose_files[@]}" exec -T "$service" \
      php "/tmp/prettyblocks-${fixture}.php" "/var/www/html/modules/prettyblocks/${target}"
  done

  docker compose "${compose_files[@]}" cp \
    "$project_dir/tests/scss-smoke.php" "$service:/tmp/prettyblocks-scss-smoke.php"
  docker compose "${compose_files[@]}" exec -T "$service" \
    php /tmp/prettyblocks-scss-smoke.php

  docker compose "${compose_files[@]}" cp \
    "$project_dir/tests/block-title-test.php" "$service:/tmp/prettyblocks-block-title-test.php"
  docker compose "${compose_files[@]}" exec -T -u www-data "$service" \
    php /tmp/prettyblocks-block-title-test.php /var/www/html/modules/prettyblocks/classes/PrettyBlocksModel.php

  docker compose "${compose_files[@]}" exec -T "$service" php -r '
    require "/var/www/html/modules/prettyblocks/vendor/autoload.php";

    if (!class_exists("ScssPhp\\ScssPhp\\Compiler")) {
        fwrite(STDERR, "The production SCSS dependency is missing.\n");
        exit(1);
    }

    if (Composer\InstalledVersions::isInstalled("prestashop/php-dev-tools")) {
        fwrite(STDERR, "A development Composer dependency leaked into the release.\n");
        exit(1);
    }
  '

  docker compose "${compose_files[@]}" exec -T "$service" sh -lc \
    'find modules/prettyblocks -type f -name "*.php" -print0 | xargs -0 -n 1 php -l >/dev/null'

  if [[ ${PRETTYBLOCKS_KEEP_STACK:-0} == 1 ]]; then
    # CLI smoke tests may create cache files as root; keep BO previews writable.
    docker compose "${compose_files[@]}" exec -T "$service" \
      chown -R www-data:www-data /var/www/html/var/cache
  fi
done

for service_and_port in "ps82:$PS82_PORT" "ps91:$PS91_PORT"; do
  service=${service_and_port%%:*}
  port=${service_and_port##*:}

  asset_paths=$(docker compose "${compose_files[@]}" exec -T "$service" php -r '
    $manifestPath = "modules/prettyblocks/build/manifest.json";
    $manifest = json_decode(
        file_get_contents($manifestPath),
        true,
        512,
        JSON_THROW_ON_ERROR
    );

    $entry = $manifest["index.html"] ?? null;
    if (!is_array($entry) || true !== ($entry["isEntry"] ?? false)) {
        throw new RuntimeException("The Vite manifest has no index.html entry.");
    }

    $javascript = $entry["file"] ?? null;
    $stylesheets = $entry["css"] ?? null;
    if (!is_string($javascript) || !str_ends_with($javascript, ".js")) {
        throw new RuntimeException("The Vite manifest has no entry JavaScript.");
    }
    if (!is_array($stylesheets) || [] === $stylesheets) {
        throw new RuntimeException("The Vite manifest has no entry stylesheet.");
    }

    foreach (array_merge([$javascript], $stylesheets) as $asset) {
        if (
            !is_string($asset)
            || str_starts_with($asset, "/")
            || str_contains($asset, "..")
            || str_contains($asset, "\\")
        ) {
            throw new RuntimeException("The Vite manifest contains an unsafe asset path.");
        }

        echo $asset, "\n";
    }
  ' | tr -d '\r')

  while IFS= read -r asset_path; do
    [ -n "$asset_path" ] || continue
    curl -fsS "http://localhost:${port}/modules/prettyblocks/build/${asset_path}" >/dev/null
  done <<< "$asset_paths"

  curl -fsS "http://localhost:${port}/modules/prettyblocks/views/js/build/build.js" >/dev/null
  curl -fsS "http://localhost:${port}/modules/prettyblocks/views/css/dist/main.css" >/dev/null
done

echo "Packaged release passed on both clean PrestaShop stacks."
