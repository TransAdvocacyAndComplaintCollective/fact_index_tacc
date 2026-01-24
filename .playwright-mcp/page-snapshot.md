### Page state
- Page URL: http://127.0.0.1:4200/
- Page Title: Fabs Fact Database
- Page Snapshot:
```yaml
- generic [ref=e2]:
  - navigation "Main navigation" [ref=e3]:
    - generic [ref=e4]:
      - link "Home" [ref=e5] [cursor=pointer]:
        - /url: /
      - link "Fact Database" [ref=e6] [cursor=pointer]:
        - /url: /facts
    - link "Login with Discord" [ref=e9] [cursor=pointer]:
      - /url: /auth/discord/discord
  - main [ref=e10]:
    - heading "Welcome to FACT INDEX" [level=1] [ref=e11]
    - generic [ref=e13]:
      - text: You can
      - link "log in" [ref=e14] [cursor=pointer]:
        - /url: /login
      - text: to access all features.
    - navigation "Main navigation" [ref=e15]:
      - list [ref=e16]:
        - listitem [ref=e17]:
          - link "Home" [ref=e18] [cursor=pointer]:
            - /url: /
```
