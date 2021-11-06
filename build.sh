#!/bin/bash

cd "$(dirname "${BASH_SOURCE[0]}")" || exit 2

npm run build
