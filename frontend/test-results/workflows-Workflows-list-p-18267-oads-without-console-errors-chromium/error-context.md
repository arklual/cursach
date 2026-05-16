# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflows.spec.ts >> Workflows list page >> list loads without console errors
- Location: e2e/workflows.spec.ts:21:7

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