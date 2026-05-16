# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: runs.spec.ts >> Runs — API >> enqueue a run and find it in the list
- Location: e2e/runs.spec.ts:26:7

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED ::1:8080
Call log:
  - → GET http://localhost:8080/v1/workflows
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br

```

```
Error: apiRequestContext.get: connect ECONNREFUSED ::1:8080
Call log:
  - → GET http://localhost:8080/v1/workflows
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br

```