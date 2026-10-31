#!/bin/sh
set -eu
case "$(uname -s)" in Linux) ;; *) printf '%s\n' 'This installer requires Linux.' >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64) ;; *) printf '%s\n' 'This installer archive is for Linux x64. Select a supported architecture-specific download.' >&2; exit 1 ;; esac
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
if ! "$package_dir/runtime/bin/node" --version >/dev/null 2>&1; then
 printf '%s\n' 'The bundled Linux runtime cannot start. Check the supported OS baseline and its glibc/libstdc++ libraries before opening the local prerequisite review.' >&2
 exit 1
fi
case "${1-}" in
 --project) exec "$package_dir/runtime/bin/node" "$package_dir/Setup-Linux.cjs" ;;
 '') exec "$package_dir/runtime/bin/node" "$package_dir/Setup-SystemLinux.cjs" ;;
 *) printf '%s\n' 'Use ./install.sh for system monitoring or ./install.sh --project for the existing project connector.' >&2; exit 1 ;;
esac
