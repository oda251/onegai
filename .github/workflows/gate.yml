# This file is managed by Terraform. Do not edit manually.
name: Gate

on:
  pull_request:

jobs:
  gate:
    if: always()
    needs: []
    runs-on: ubuntu-latest
    steps:
      - run: exit 1
        if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')
