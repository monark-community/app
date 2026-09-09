# Test layers

We write tests at four layers ; each owns a different question.

| Layer           | Question                                                                                                                    | Tool                                       | Where the test lives                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| **Unit**        | Does this pure function do the right thing in isolation ?                                                                   | vitest                                     | `<package>/tests/<name>.test.ts`                |
| **Integration** | Do these modules talk to each other correctly when wired through Prisma / tRPC / nodemailer / Supabase ?                    | vitest + testcontainers / sqlite-in-memory | `<package>/tests/integration/<name>.test.ts`    |
| **Component**   | Does this React surface render + behave when given known tRPC + i18n state ?                                                | vitest + Testing Library + msw             | `services/web/tests/components/<name>.test.tsx` |
| **End-to-end**  | Can a real user sign up, sign in, manage their account, and reach admin surfaces in a real browser against a real backend ? | Playwright                                 | `services/web/tests/e2e/<flow>.spec.ts`         |

The four layers compose : a unit test catches arithmetic / parsing / regex bugs cheaply ; integration tests catch wiring + transaction + Prisma-default mistakes ; component tests catch state / loading / a11y issues without booting the whole app ; e2e catches full-stack regressions and routing.
