# vtiflis-web/ag

აგრო-ბიზნესების სამუშაო რეპოზიტორია: agromart.ge (Green House Feeding მაღაზია), LiveLeaf, FreshCut Georgia.

- **ნებისმიერ სამუშაოზე ჯერ ჩატვირთე სქილი `agromart`** (`.claude/skills/agromart/SKILL.md`): კატალოგი, ფასები, დომენი (`shop.agromart.ge`), ბრენდი, Meta-ს წესები, ეკო და მტკიცებულების წესები, არტეფაქტების ბმულები.
- ენა: ქართული, მოკლე, ცხრილებით. ციფრი არ მოიგონო; ტეგები A/B/C/D.
- გარე ქმედება (გამოქვეყნება, გაგზავნა, გადახდა) მხოლოდ მფლობელის დადასტურებით.
- სამუშაო ბრანჩი: `claude/facebook-page-setup-58huzi`.

| საქაღალდე | რა |
|---|---|
| `site/` | მაღაზია; ვიჯეტი `site/ai-widget/`, აწყობა `node site/ai-widget/build.mjs` |
| `supabase/` | აგრო AI ბოტი (edge function `agro-chat`), მიგრაციები |
| `facebook/` | FB გვერდის პაკეტი |
| `chatbot/` | ბოტის deploy და ხარჯი |
| `agent/` | ავტონომიური აგენტი: Routines-ის ინსტრუქციები, live agent-ის არქიტექტურა |

შემოწმება: `deno check supabase/functions/agro-chat/index.ts`; ვიჯეტი: Playwright (`/opt/node22/lib/node_modules/playwright`).
