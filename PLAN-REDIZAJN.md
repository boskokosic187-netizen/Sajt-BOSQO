# BOSQO 2.0 — plan totalne rekonstrukcije portfolija

**Datum:** 14. 10. 2026.
**Grana:** `redizajn-2026`. `master` se pri svakom push-u automatski deployuje na VPS, zato novi sajt gradimo odvojeno dok ne bude spreman za lansiranje.
**Status:** koncept ON AIR odobren 14. 10. 2026; odluke u sekciji 11.

---

## 1. Dijagnoza starog sajta (bosko.trif.rs)

Šta danas radi protiv zaposlenja:

1. **Na prvom ekranu nema nijednog rada.** Vide se zvezdano nebo, avatar, plutajuće Adobe ikonice i paneli sa ocenama veština. Do prvog rada se stiže tek posle 3–4 klika (WORK → roadmap → projekat → galerija). Regruteri prvu odluku donose u roku od nekoliko sekundi do pola minuta, a neki odmah odustaju ako ne nađu projekte.
2. **Ocene veština zvezdicama (★★★★★) i ikone alata** deluju juniorski. Firma plaća rezultat, a ne poznavanje alata.
3. **Radovi su galerije po klijentu**: desetine slika bez priče. Nigde ne piše koji je bio izazov, koja je bila tvoja uloga ni kakav je bio rezultat.
4. **Animacija, tvoja najprodavanija veština, sakrivena je u 6 YouTube embedova.** Sajt nema showreel.
5. **Pozicioniranje je generičko** („Multidisciplinary Visual Designer“), a NFT je u prvom planu. Mnogim firmama 2026. NFT nije preporuka, pa to treba preformulisati kao rad za gaming i Web3 brendove.
6. **Fale svi radovi iz 2026.** Nema nijednog od 88 projekata iz Production Visuals: FSU kampanja, izložbi, key arta, ZTV dresova, AI produkt videa.
7. **Performanse su loše.** Sajt učitava ~400 KB CSS-a i JS-a, a Calendly, Google Analytics i fontovi kreću odmah. Canvas animacije stalno rade, i na telefonu, a kursor je slika.
8. **Nema OG preview slike**, pa link poslat na LinkedIn, Slack ili Viber nema lepu karticu.
9. **Sajt je na tuđem poddomenu** (bosko.trif.rs). Za lični brend je bolji sopstveni domen.

**Zadržavamo:** kontakt formu (Web3Forms), Calendly (koji se učitava tek na klik), deploy na VPS, BOSQO logo i fotografiju.

---

## 2. Istraživanje: kako firme gledaju portfolija

| Nalaz | Šta znači za nas |
|---|---|
| 78% donosilaca odluka se pri prvoj proceni najviše oslanja na portfolio i case study-je. CV je presudan za 40%. | Portfolio je glavni prodajni alat. |
| Preferirani formati: **portfolio sajt 72%**, Figma 30%, PDF 27%, prezentacija 26%, Behance/Dribbble 14%. | Glavni format je sajt. **PDF verzija je obavezan dodatak**, jer je dosta oglasa traži kao prilog. |
| Prvo skeniranje traje 6–8 s, a ceo pregled 2–3 min. Hiring menadžeri prvi put prolaze ~5 min, a pred intervju ~15 min. | Radovi moraju biti vidljivi u prvoj sekundi. Case study mora da se pročita za 60–90 s. |
| Showreel treba da traje 30–90 s, sa najjačim kadrom u prvih 5 s. Mora da radi i bez zvuka. Pored njega 2–3 projekta sa procesom. | Showreel je **najvažniji asset koji ti fali**. |
| Beograd trenutno: **s360** traži 2 motion graphic dizajnera za ad kreative i portfolio sa motion radovima. **Wargaming** (World of Warships) traži motion dizajnera sa showreelom u 2D i 3D. **Nordeus**: Marketing Artist, gde si već aplicirao. | Sva tri profila traže kampanje, key art, motion, brzinu i više formata, a to radiš svaki dan. |

**Desktop ili telefon?** Nisam našao pouzdanu statistiku na kom uređaju se portfoliji pregledaju. Zaključujem iz toga kako proces zapošljavanja izgleda:
- Link se otvara iz CV-a, mejla, ATS sistema ili LinkedIn-a, **najčešće na laptopu**. HR često radi na 1366×768 ili na 1536×864 (Windows laptop sa skaliranjem 125%).
- Prvi kontakt je često **sa telefona** (LinkedIn aplikacija, Instagram, Viber).
- Zato je **desktop primarno iskustvo sa punim „wow“ efektom**, a **mobilni dobija poseban, vertikalni doživljaj**, ne smanjenu verziju desktopa.

---

## 3. Koncept: „ON AIR“, sajt kao montažna sala / zid ekrana

> Već u prvoj sekundi posetilac vidi 15+ tvojih radova u pokretu, kao zid ekrana u režiji, i ime koje „seče“ preko njih.

**Zašto ovaj koncept:** istovremeno daje „wow“ i pokazuje i kvalitet i obim rada za 3 sekunde. Motion jezik sajta (rezovi, timecode, REC, oznake kadra) je i sam demonstracija motion dizajna. Tvoj rad su pretežno kampanje, bilbordi i motion, pa im „broadcast“ estetika prirodno pristaje. Neutralna tamna pozadina pušta tvoje boje (Ballies zelena, ITS crvena, FSU ljubičasta i žuta) da dominiraju.

**Vizuelni jezik**
- Pozadina skoro crna (`#0A0A0B`), tekst topla bela. Jedan signalni akcent (predlog: REC narandžasto-crvena `#FF4D1F`) koristi se samo za „live“ oznake i CTA dugmad.
- Tipografija:
  - masivan grotesk za naslove (npr. Archivo Expanded/Black ili Bricolage Grotesque);
  - Inter za tekst;
  - serif kurziv (Instrument Serif) kao akcenat, kao odjek tvog FSU stila.
- Svi fontovi imaju latin-ext (Boško Kosić: č ć š ž đ), hostuju se na našem serveru kao woff2 i sadrže samo potrebne znakove.
- Motion jezik:
  - tvrdi rezovi i wipe prelazi umesto fade-a;
  - timecode brojač (`00:00:12:04`) i „● LIVE“ oznake na bilbordima;
  - crop marks kao okviri;
  - maske koje otkrivaju tekst;
  - montažni easing: brzo pa sporo.

**Izbacujemo:** zvezdano nebo, avatar u krugu, plutajuće Adobe ikonice, ocene zvezdicama i overlay sistem starog sajta.

---

## 4. Hero: šta je na prvom ekranu

### Desktop (dizajn za 1440 i 1536×864, test od 1366×768 do 2560)
- **Pozadina je „video zid“**: mreža od 12–15 pločica u različitim formatima (16:9 bilbord, 1:1 post, 9:16 story). Svaka naizmenično pušta petlju tvog rada od 3–4 s.
- **Kursor je reflektor.** Pločica ispod miša se izoštri i uveća, a ostale se zatamne. To je CSS maska, pa skoro ne opterećuje performanse. Ceo zid blago prati miša (parallax).
- **Preko zida** stoji veliko **BOŠKO KOSIĆ**. Slova ulaze kinetički, kao rez u montaži. Ispod je pozicioniranje (predlog):
  - *„Campaigns, key art & motion that stop the scroll.“*
  - *„Belgrade-based visual & motion designer · 5+ years · education, gaming & Web3 brands · now running animated billboards across Belgrade.“*
- **Dugmad:** `▶ Play reel · 01:00` i `See work ↓`
- **Statusna traka na dnu**, kao na monitoru u režiji: ● Available for full-time & freelance · Belgrade 14:32 · timecode · traka logotipa klijenata (FSU, ITS, ITHS, Ballies, WSG, ZTV, Baby Boo, KUN, Telegraf, InnovNation).
- **Klik na bilo koju pločicu** glatko prelazi direktno u taj projekat (View Transitions API, sa rezervnim rešenjem za starije pregledače).

### Mobilni (≤ 767 px): „Reels“ doživljaj
- Hero je **vertikalni 9:16 reel preko celog ekrana**. Pušta se automatski bez zvuka, a poster se vidi odmah. Preko njega su ime, jedna rečenica i „Tap for sound“.
- **Swipe nagore otvara feed projekata.** Svaka kartica je petlja u 9:16 sa naslovom i jednom rečenicom. Tap otvara case study u jednoj koloni.
- **Donja fiksna traka** (Work · Reel · Contact) je u zoni palca.
- Bez hovera, custom kursora i WebGL-a. Video je u 720p, najviše 1,5 MB po klipu.
- Ovo ti prirodno leži jer imaš mnogo 9:16 materijala: Ballies, ITS animiranu reklamu, Manuka Honey, Montenegro, AI Baby Boo.

### Tablet (768–1199 px)
Raspored kao na desktopu, ali sa touch ponašanjem i lakšim zidom od 8 pločica.

---

## 5. Struktura sajta

1. **Hero**: video zid, ime i dugme za reel.
2. **Showreel (60–75 s)**: pokreće se kad uđe u kadar, a klik uključuje zvuk.
3. **Selected Work**: 6 vodećih case study-ja. Kartice puštaju video preview na hover.
4. **How I Work**: interaktivni demo „1 brief → 1 key visual → 14 formata“. Jedan vizual se pred posetiocem preliva u formate 1:1, 4:5, 9:16, 16:9, bilbord, mejl baner i šlajfnu, tačno kao tvoj stvarni sistem za ITS, FSU i ITHS. Uz to tvoj pipeline (AE ekspresije i skripte, Python kompozit, AI workflow) i brojke.
5. **Archive / Playground**: zid svih radova sa filterima (Motion · Key art · Campaigns · OOH & Print · Social systems · Merch · AI) i lightboxom.
6. **About**: fotografija, kratka priča, iskustvo kao timeline, usluge, klijenti i 2–3 preporuke.
7. **Contact**:
   - veliki mejl (klik ga kopira);
   - Book a call (Calendly se učitava tek na klik);
   - Download CV;
   - LinkedIn · Behance · Instagram.
8. **Footer:** „Designed, animated & coded by me“. Sam sajt je dokaz tvojih front-end veština.

**Bonus za prijave na oglase:** skrivene stranice po firmi (`/for/nordeus`, `/for/wargaming`…). Svaka prikazuje 4 najrelevantnija rada i kratku poruku toj firmi. Prave se za ~10 minuta po firmi i ostavljaju jak utisak.

**Šablon za case study (isti za sve, čita se za 60–90 s):**
1. hero video ili vizual;
2. izazov u jednoj rečenici;
3. uloga, rok i isporuke;
4. ideja;
5. sistem, odnosno svi formati;
6. proces (before/after slajder);
7. rezultat sa brojkama;
8. link na sledeći projekat.

---

## 6. Kuracija: šta ide na sajt

**Šta sam pregledao:**
- 88 projekata u `Production Visuals`;
- Ballies (467 fajlova, 91 video);
- arhive ITS i FSU (~4.900 fajlova, 30+ animiranih bilborda);
- `Ballies Best`, `FSU Best`, `Ai Baby Boo`, `BabyBoo`, `ARMABETON`;
- postere na desktopu i staru selekciju u `_izvori/drive-gmail/SELEKCIJA.md`.

### 6 vodećih case study-ja

| # | Projekat | Šta sadrži | Zašto baš on |
|---|---|---|---|
| 1 | **Animated Live Billboards**: ITS × ITHS × FSU | 20+ animiranih bilborda (okt 2025 – jul 2026), ITS animirana reklama 9:16 (44 s), animirani kalendar nastave | Najjedinstveniji rad, jer malo dizajnera ima OOH motion u portfoliju. Prikazujemo ga u stvarnim beogradskim ulicama (mockup). |
| 2 | **Ballies**: 2+ godine jednog brend univerzuma | sezonske kampanje, AI launch, badge i airdrop sistem, Arena, borbe maskota („strike 1“), logo animacija, template sistem za partnerstva | Ključan za gaming poslodavce |
| 3 | **FSU 2026**: kampanje i identiteti izložbi | Tačke susreta, Prostor u nastajanju, Pogled iz blizine, Doors, Remek-delo, POV štikla (Master KK), „I judge books by their cover“, Jutro, Duh Beograda (sa Telegrafom + video), Fluidi, Samo jedan rad (80 fajlova), Galerija koja raste, Tri gracije, Immersion, Shift, AI FilmFest Serbia 2026 | Pokazuje art direction, raspon i sistemsko razmišljanje. |
| 4 | **Key Art**: Car Dušan · Carstvo srpsko i Batman v Superman „Sudar u kiši“ | filmski kompoziti u 4K/8K | Interaktivni breakdown (MJ elementi → kompozit → grading) i „živi poster“. |
| 5 | **AI Product Films**: Baby Boo | Manuka Honey pilot (9:16 i 4K), AI serija (Slon, Valentines, Med) | AI produkt reklame su tražena veština 2026. |
| 6 | **ZTV Gaming Show**: 8 esports dresova | sublimacija, sistem za 8 timova | Merch i apparel za gaming. |

### Arhiva / playground (~40 radova)
- **ITHS multiformat sistem:** app mockupi (Calories Tracker, NailBook, Menadžer kućnog budžeta, Šapa), Matematički Super Mario, Srebro…
- **ITS serije:** Šta radi zanimanje, Studijski programi i moduli, ChatGPT karuseli, Brucošijada & Alumni Club Night.
- **FSU:** slajdovi studijskih programa.
- **Ostali klijenti:** KUN podcast, VK Blog (AI sinematične ilustracije), Kultura Barbershop (edukativni deck).
- **Print i veliki format:** transparent „Studenti pobeđuju“ (6 m), skulptura 90×60, Odyssey poster, natpis Upisnog centra, beach flags.
- **Animacija i stariji radovi:** Lisica maše (character animacija), WSG baneri, LINK Group arena.

### Ne ide, ili samo uz proveru
- In Memoriam, NAT sednice, obrasci, odbrane i tutorijali: interna komunikacija koja ne prodaje.
- ITHS objave sa licima maloletnih učenika: ne idu kao hero ili naslovne slike. U arhivi samo ako škola to dozvoli.
- Batman v Superman: označiti kao „Personal / fan art“, jer je IP tuđi.
- ARMA BETON: fotografije nisu tvoje. Video ide samo ako je montaža tvoja.
- Ballies objave sa pravim sportistima: samo kao deo kampanje, ne kao izdvojeni radovi.

---

## 7. Šta dodatno da napravimo (fokus na animaciji)

### Prioritet A: pre lansiranja
1. **Showreel 60–75 s**, najvažniji asset koji fali.
   - Najjači kadar u prve 3 s, ritam prati muziku, radi i bez zvuka.
   - Verzije: 16:9 za sajt i LinkedIn, 9:16 za mobilni hero i Instagram.
   - Materijal: bilbordi, Ballies maskote i AI, Manuka Honey, Duh Beograda, ITS reklama, živi posteri, logo animacije.
2. **„Živi posteri“**: Car Dušan i BvS u 2.5D (depth i parallax kamera, kiša, prašina, svetlo), kao petlje od 6–8 s. Spajaju key art i motion, pa daju najjači „wow“.
3. **Bilbordi u prostoru**: 3–4 animacije ukomponovane u fotografije ili kadrove stvarnih beogradskih lokacija.
4. **Logo animacije**: 4–5 reveal-a (FSU Upisni centar, Galerija FSU, BOSQO, Ballies…).
5. **OG slika, favicon i mikro-animacija BOSQO logotipa.**

### Prioritet B: posle lansiranja, kao dopuna sajta
6. **Spec kampanja za mobilnu igru** (izmišljen naslov): key art, 3 animirana oglasa (9:16, 1:1, 16:9) i store screenshoti. Cilja direktno na Nordeus, Wargaming i s360 tip posla.
7. **Performance ad paket**: jedan proizvod i 6 kratkih animiranih oglasa sa „hook-om“ u prvoj sekundi, baš ono što traži s360.
8. **3D komad u Blenderu**, npr. Ballies badge ili coin, ili Baby Boo packshot. Wargaming traži 2D + 3D.
9. **App promo animacija** od ITHS app mockupa (Calories Tracker, NailBook).
10. **Kinetička tipografija od 15 s**, npr. „I judge books by their cover“ ili BOSQO manifest.

---

## 8. Tehnički plan i performanse

### Stack (preporuka)
- **Astro**: statički sajt koji po defaultu šalje 0 KB JS-a i automatski optimizuje slike.
- **Vanilla JS i GSAP** (ScrollTrigger, SplitText; GSAP je sada besplatan) za animacije.
- **Bez React-a i Three.js** na celom sajtu. Mali WebGL efekat ide samo na desktop i samo ako uređaj može da ga izvede.
- **Alternativa bez build koraka:** čist HTML/CSS/JS kao danas. Deploy je lakši, ali ima više ručnog rada.

### Budžet performansi
- **Ciljevi:** LCP < 2,0 s na 4G, INP < 200 ms, CLS < 0,05. Google prag za „dobro“ je 2,5 s / 200 ms / 0,1.
- **Težina:** prvi ekran najviše 350 KB bez videa, ukupan JS najviše 70 KB gzip, fontovi najviše 80 KB.
- **Slike:** AVIF i WebP, responsive `srcset`, lazy loading.
- **Video za pločice zida:**
  - petlje od 2–4 s u 360p;
  - AV1/VP9 WebM sa MP4 kao rezervom;
  - 100–250 KB po komadu;
  - puštaju se samo kad su vidljive.
- **Showreel:** 1080p na desktopu i 720p na mobilnom, sa `preload="none"` i posterom.
- **3 nivoa kvaliteta, bira se automatski:**
  - **Full:** jak desktop.
  - **Lite:** slab uređaj (`deviceMemory < 4`, malo jezgara, Save-Data ili spora mreža). Umesto videa se prikazuju posteri, bez WebGL-a.
  - **Reduced motion:** poštuje sistemsko podešavanje.
- **Servisi trećih strana:** Calendly se učitava tek na klik. Analitika je lagana (Plausible, Umami ili Cloudflare), ili se GA učitava tek posle prve interakcije.
- **Hosting videa:** VPS, ako ima dovoljno protoka. U suprotnom CDN (Bunny ili Cloudflare R2, par evra mesečno).

### Automatski pipeline za assete
Pravim ga ja.
- Python skripta: slike → AVIF/WebP u 4 veličine.
- ffmpeg: video → petlje, posteri i 3 kvaliteta.

Dodaš rad u folder i dobiješ ga spremnog za sajt.

### Ostalo
- **SEO i deljenje:** OG/Twitter kartice za svaku stranicu, schema.org Person, sitemap, naslovi i opisi.
- **Analitika događaja:** pušten reel, preuzet CV, kopiran mejl, otvoren case study. Tako znamo šta regruteri gledaju.
- **Pristupačnost:** alt tekstovi, navigacija tastaturom, kontrast, reduced motion.
- **Testiranje:**
  - pregledači: Chrome, Safari, Firefox i Edge;
  - uređaji: stari laptop 1366×768, jeftin Android i iPhone;
  - PageSpeed Insights;
  - preview kartice na LinkedIn-u, Viberu, WhatsApp-u i Slack-u.

---

## 9. Faze

| Faza | Šta se radi | Rezultat |
|---|---|---|
| 0. Odluke | Odobravaš koncept i odgovaraš na pitanja iz sekcije 10. | Zaključan pravac |
| 1. Sadržaj | Konačna selekcija, engleski tekstovi za case study-je, brojke, pipeline za assete. | Sav sadržaj spreman |
| 2. Produkcija | Showreel, živi posteri, bilbordi u prostoru, logo animacije. | Novi motion asseti |
| 3. Dizajn | Dizajn sistem i interaktivni prototip hero-a i jednog case study-ja (desktop + mobilni). | **Tvoje odobrenje pre izrade celog sajta** |
| 4. Izrada | Sve sekcije, case study-ji, arhiva, mobilni doživljaj, nivoi kvaliteta. | Sajt na grani `redizajn-2026` |
| 5. QA | Performanse, uređaji, pregledači, preview kartice. | Izveštaj i ispravke |
| 6. Lansiranje | Domen, deploy, analitika, preusmerenje sa starog linka. Ažuriramo CV, LinkedIn i Behance i pravimo PDF portfolio (10–12 strana) iz istog sadržaja. | Sajt uživo |

---

## 10. Šta mi treba od tebe

1. **Cilj:** koji posao juriš? Full-time in-house u gaming ili tech firmi, agenciju, freelance klijente ili remote za inostranstvo? Od toga zavisi glavna poruka hero-a.
2. **Radna istorija:** CV kaže Freelance 2020– i asistent na ITS-u 2022–, a stari PDF kaže LINK Group 2022–2023 i Ballies od januara 2023.
   - Da li još radiš za Ballies?
   - Kako se zove tvoja uloga u marketingu ITS/FSU/ITHS?
   - Koji master program pohađaš?
3. **Brojke** (mogu i okvirne):
   - koliko animiranih bilborda i na koliko lokacija;
   - koliko vizuala godišnje;
   - rezultati: upis, pregledi, engagement, rast Ballies zajednice.
4. **Dozvole i NDA:** smeš li da prikažeš radove za ITS/FSU/ITHS, Ballies, ZTV, Baby Boo, KUN i VK? Ima li nešto što ne sme na sajt?
5. **Preporuke:** 2–3 kratke izjave (citat, ime i funkcija).
6. **Domen i server:**
   - Zadržavamo bosko.trif.rs ili kupujemo sopstveni (npr. bosqo.com ili boskokosic.com)?
   - Ko upravlja VPS-om i šta radi `deploy` skripta? To nam treba zbog build koraka.
7. **Fotografija:** JA.png ili novi portret? Imaš li kratak video sebe od 3–5 s za About?
8. **Muzika za showreel:** imaš licencu (Artlist, Epidemic) ili da generišemo originalnu?
9. **Video sa Drive-a koji fali:** WSG final, IMX zkEVM, Ballies platform promo i video logo moraš da skineš ručno (preko 10 MB su).
10. **Jezik:** samo engleski (preporuka) ili i srpski?
11. **Kontakt:** ide li telefon javno? Ostaje li Calendly?
12. **Ime ili brend:** preporuka je Boško Kosić u prvom planu, a BOSQO kao potpis i logo.

---

## 11. Odluke (14. 10. 2026)

| Tema | Odluka |
|---|---|
| Koncept | **ON AIR** odobren. |
| Cilj | Jake firme širom sveta (grafički dizajn, animacija, motion), prijave uglavnom preko LinkedIn-a, plus **Toptal**. Ton i tekst su međunarodni: „Belgrade · working worldwide (CET)“. |
| Iskustvo | Saradnik u nastavi ITS, **okt 2024 – danas** · Ballies, **jan 2023 – jan 2026** · LINK Group, **feb – jun 2023** · micro1, Adobe Illustrator expert za AI trening, **jun 2026** · projekti za firme (freelance). Stari CV (2022) treba ispraviti. |
| Bilbordi | **50+ različitih bilborda** širom Beograda u poslednje dve godine, animirani (i interaktivni) i statični. Za portfolio pravimo **nove, jače animirane verzije bilborda**. |
| Dozvole | Sme sve da se objavi. |
| Tekst | Ceo copywriting pišem ja → `content/copy.en.md`. Preporuke ne izmišljamo: tražimo ih od stvarnih ljudi (šablon poruke u copy fajlu), a sekcija ostaje skrivena dok ne stignu. |
| Domen | Za sada **bosko.trif.rs**, kasnije lični domen. Deploy ostaje isti: push na `master` → VPS. Zato sajt ostaje statičan (HTML/CSS/JS u repou, bez obaveznog build koraka na serveru). |
| Fotografija | About: postojeća crno-bela „za stolom“ fotografija (`mojaslika.webp`) odlično pristaje. Opciono nova filmska verzija (ChatGPT prompt u copy fajlu), ali mora da ostane prepoznatljiva. |
| Muzika | Samo licencirana: preko konektora (proveriti uslove licence pre upotrebe) ili druga licencirana opcija. |
| Video | Kratke petlje (zid, previewi, mobilni feed) hostujemo sami (MP4/WebM). Showreel može na YouTube, ali preko „lite“ fasade: slika dok se ne klikne, iframe tek posle klika. |
| Jezik | Samo engleski. |
| Kontakt | Mejl je glavni put. Calendly ostaje kao sporedna opcija, učitava se na klik. |
| Ime | **Boško Kosić** je glavni brend. BOSQO ide u penziju; novi znak (monogram) razvijamo u fazi dizajna. |

---

## 12. Status: prvi prototip (14. 10. 2026)

**Šta je urađeno**
- **Struktura:**
  - novi sajt je u korenu repoa: `index.html`, `css/site.css`, `js/site.js`;
  - stari sajt je premešten u `_stari-sajt/`.
- **Mediji:** `tools/build_media.py` iz originalnih fajlova pravi `media/`:
  - 17 video petlji, svaku sa 9:16 varijantom;
  - 18 slika u AVIF/WebP formatu;
  - mobilni reel (16 s, 1,4 MB).

  Petlja se bira automatski: skripta uzima 4 s sa najviše pokreta.
- **Desktop:**
  - video zid (34 ekrana, najviše 6 video snimaka istovremeno);
  - reflektor i parallax na mišu;
  - ime koje se uklapa u širinu;
  - on-air traka sa timecode-om;
  - Showreel sekcija;
  - Selected Work sa lebdećim video pregledom;
  - kontakt sa kopiranjem mejla.
- **Mobilni:**
  - vertikalni reel u heru;
  - feed kartica, gde se pušta samo ona koja je na ekranu;
  - donja traka sa navigacijom.
- **Lite režim:** slabi uređaji, Save-Data i reduced motion dobijaju postere umesto videa.
- **Izmereno lokalno:** CLS 0, slike u prvom ekranu ~145 KB, nema JS biblioteka.

**Sledeće**
1. Case study stranice (6).
2. Sekcije Process i About.
3. Fontovi sa našeg servera (umesto Google Fonts).
4. OG slika.
5. Showreel.
6. Novi bilbordi.
7. Monogram.

---

## 13. Status: case study stranice, Process i About (14. 10. 2026)

**Šta je urađeno**
- **6 case study stranica:**
  - nalaze se u `work/<slug>/` i generišu se iz `content/cases.json` pomoću `tools/build_cases.py`;
  - svaka ima: hero, meta, priču (izazov i ideja), galeriju u ravnim redovima bez sečenja radova, sistem, rezultat i link na sledeći case;
  - Key Art ima i interaktivni before/after slajder (blocking → finalni grade).
- **Galerija:**
  - 109 radova;
  - video se pušta samo dok je na ekranu;
  - lightbox sa strelicama levo/desno.
- **Prelaz između stranica:** „broadcast wipe“ (View Transitions; stariji pregledači samo promene stranu).
- **Početna strana:**
  - **Process:** demo gde se jedan FSU vizual preliva kroz 7 formata, plus 5 koraka;
  - **About:** fotografija, bio, usluge, iskustvo, obrazovanje, alati i traka klijenata.
- **Lista projekata:** vodi na prave case stranice. Klik na ekran sa zida otvara odgovarajući case.
- **Izmena:** ZTV je izašao iz glavnih šest (bila je priprema za štampu, ne dizajn), a umesto njega ide **Series at Scale** (ITS/ITHS serije).
- **Izmereno lokalno:**
  - case stranica ~370 KB pri učitavanju, CLS 0, nema pokvarenih slika;
  - početna strana: slike u prvom učitavanju ~575 KB (bilo je ~940 KB pre odlaganja Process slika).

**Sledeće**
1. Fontovi na našem serveru (traži dozvolu za preuzimanje woff2 fajlova).
2. OG slika 1200×630.
3. Showreel (licencirana muzika).
4. Novi animirani bilbordi.
5. „Živi poster“ Car Dušan (2.5D od slojeva iz `compose.py`).
6. Monogram.
7. Arhiva (ZTV, KUN, VK Blog, Kultura...).
8. Kompresija najtežih Ballies videa (1,4–1,6 MB).
