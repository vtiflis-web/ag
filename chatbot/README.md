# აგრო AI: agromart.ge-ს ჩატ-ბოტი

ბოტი პასუხობს მცენარეებზე, სასუქებზე, დოზებსა და მიწოდებაზე. ფოტოთი ამოიცნობს სავარაუდო პრობლემას. პასუხში ჩნდება ღილაკები: **კალათაში**, **ნაკრები**, **პერსონალური გეგმა**, **ფოტო Viber-ში**.

## არქიტექტურა

```
საიტი (site/index.html)                    Supabase
┌───────────────────────┐   POST JSON    ┌──────────────────────────┐   stream   ┌────────────┐
│ ვიჯეტი „აგრო AI“       │ ─────────────▶ │ edge function agro-chat  │ ─────────▶ │ Claude API │
│ CONFIG.aiEndpoint      │ ◀───────────── │ CORS · ვალიდაცია · limit │ ◀───────── │ Opus 5.5   │
│ [[add:…]] → ღილაკები   │  text stream   │ system prompt (cache)    │            └────────────┘
└───────────────────────┘                │ → chat_logs (Postgres)   │
                                         └──────────────────────────┘
```

| ფაილი | დანიშნულება |
|---|---|
| `supabase/functions/agro-chat/prompt.ts` | პერსონა და წესები (`RULES`) + კატალოგი, დოზები, მიწოდება (`KNOWLEDGE`). **ერთადერთი წყარო** |
| `supabase/functions/agro-chat/index.ts` | Edge function: CORS allowlist, ვალიდაცია (≤16 turn, ≤2000 სიმბ., ფოტო ≤1.5 MB), rate-limit 30/10 წთ IP-ზე, streaming, refusal fallback, ლოგი |
| `supabase/migrations/…_chat_logs.sql` | `chat_logs` ცხრილი (RLS, საჯარო წვდომის გარეშე) + `chat_daily` view ტოკენებით |
| `site/ai-widget/*` | ვიჯეტის CSS/HTML/JS. `node site/ai-widget/build.mjs` ჩასვამს `site/index.html`-ში |

**მოდელი:** `claude-opus-5-5`, adaptive thinking, `effort: low`, `fallbacks: "default"`. თუ უსაფრთხოების ფილტრი უარს იტყვის, მოთხოვნა სერვერზევე სხვა მოდელზე გადადის. სისტემური პრომპტი ქეშირდება: `cache_control` ბოლო ბლოკზე.

**რეჟიმები:**
1. `CONFIG.aiEndpoint` შევსებულია → production. ბოტი მუშაობს Supabase-ით, Anthropic-ის ხარჯი შენს ანგარიშზეა.
2. ცარიელია და გვერდი claude.ai-ზე იხსნება → დემო არტეფაქტის `sample` capability-თ. ცოდნას ვიჯეტი გვერდის ცოცხალი მონაცემებიდან აგებს, ხარჯს მნახველის Claude ანგარიში იხდის.
3. ცარიელია და claude.ai არ არის → ღილაკი დამალულია.

## Deploy (≈15 წთ)

```bash
# 1. Supabase CLI, პროექტთან დაკავშირება
supabase login
supabase link --project-ref <PROJECT_REF>

# 2. ცხრილი
supabase db push

# 3. საიდუმლოები
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ALLOWED_ORIGINS=https://shop.agromart.ge,https://agromart.ge,https://www.agromart.ge
# არასავალდებულო: AGRO_MODEL=claude-sonnet-5-5 (2× იაფი), AGRO_EFFORT=low|medium

# 4. ფუნქცია (JWT-ის გარეშე: საიტი ანონიმურად იძახებს, დაცვა CORS-ითა და limit-ით)
supabase functions deploy agro-chat --no-verify-jwt
```

5. `site/index.html`-ში ჩაწერე `CONFIG.aiEndpoint = "https://<PROJECT_REF>.supabase.co/functions/v1/agro-chat"`.
6. შემოწმება:
   ```bash
   curl -N -X POST https://<PROJECT_REF>.supabase.co/functions/v1/agro-chat \
     -H "Origin: https://agromart.ge" -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"ვიოლეტას რა სასუქი სჭირდება?"}]}'
   ```

## ფასის ან მარაგის ცვლილებისას

1. შეცვალე `PRODUCTS` / `BUNDLES` / `CONFIG` `site/index.html`-ში. დემო-რეჟიმი ცვლილებას ავტომატურად აიღებს.
2. შეცვალე `KNOWLEDGE` `prompt.ts`-ში → `supabase functions deploy agro-chat`.
3. თუ `RULES` შეცვალე, გაუშვი `node site/ai-widget/build.mjs`.

## ხარჯი (შეფასება)

| კომპონენტი | ერთ შეკითხვაზე |
|---|---|
| სისტემური პრომპტი (~7.5k სიმბოლო ქართულად), cache read $0.20/MTok | < $0.002 |
| ისტორია + კითხვა, $4/MTok | ≈ $0.004–0.008 |
| პასუხი + thinking (`low`), $20/MTok | ≈ $0.006–0.012 |
| **სულ** | **≈ $0.01–0.02** |

1 000 შეკითხვა თვეში ≈ $10–20. ფოტო ერთ შეკითხვას ≈ +$0.005 ამატებს. რეალური ციფრები ჩანს `select * from chat_daily;`-ში. `AGRO_MODEL=claude-sonnet-5-5` ხარჯს დაახლოებით ორჯერ ამცირებს.

## n8n ინტეგრაცია (შემდეგი ნაბიჯი)

- **დღიური რეპორტი:** n8n-ის Cron, მერე Supabase-ის `chat_daily` და ბოლო 24 სთ-ის `chat_logs`, ბოლოს Telegram: კითხვები, ხარჯი და კითხვები, რომლებზეც ბოტმა ვერ უპასუხა.
- **ლიდები:** როცა პასუხში `[[viber]]` ჩნდება ან `stop_reason = refusal`, Telegram-ში ოპერატორს ეგზავნება შეტყობინება.
- **ცოდნის განახლება:** ხშირი უპასუხო კითხვები ემატება `KNOWLEDGE`-ს.
