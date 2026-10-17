# Mobile GUI alpha 3 — 7 października 2026

Wczesna grywalna integracja projektu `mobile-gui` z prawdziwym silnikiem PerfectXI.
Interfejs jest angielski, domyślnie poziomy. Źródła: `runtime/Tsubasa_MobileUI.js`
i `runtime/mobile-ui.css`. Builder dodaje je jako ostatni plugin; działają we
wspólnym `www`, także dla podglądu Python.

## Uruchomienie

APK: `dist/Tsubasa-Offline-0.3.0-alpha3.apk` (Android 8+, istniejące opakowanie Java).
Podgląd właściwej gry: `node android-port/tools/serve.cjs 8173`, następnie
http://127.0.0.1:8173/. Uruchamiaj polecenie z głównego folderu projektu.

Testowy start meczu: serwer na 8175 i http://127.0.0.1:8175/__match-test.html.
Ten adres automatycznie rozpoczyna mecz testowy; nie służy do właściwej kariery.

## Działa w tej wersji

- Wynik, czas, aktywny zawodnik i trzech kolejnych z prawdziwej kolejki oraz SPD.
- Oryginalne portrety, bieżąca stamina, Hyper i Super z niezależnymi paskami.
- Legalne akcje silnika w panelu bocznym i More; niedostępne akcje są wyłączone.
- Dotknięcie pola wybiera ruch/cel podania; Confirm wykonuje, Cancel odrzuca wybór.
- Zmiana stanu lub aktywnego gracza unieważnia oczekujące potwierdzenie.
- Pauza z dotykową listą, zoom i pomocnicze przyciski dla oryginalnych okien.
- Dotykowe strzałki, OK i Back poza meczem. Brak osobnego przycisku Move/Next turn.
- More pokazuje Facing, korzystające z istniejącej akcji ustawienia kierunku.

## Sprawdzenie i ograniczenia

30 testów Node: wcześniejsze 23 oraz 7 nowych testów integracji wejścia i stanu HUD.
W przeglądarce uruchomiono prawdziwy mecz Japan–Brazil (22 uczestników), sprawdzono
844 × 390, panel More, pauzę i wznowienie oraz ruch Shingo Aoi: STA 305 → 303.
Naprawiono błąd przejściowego stanu aktywnego zawodnika oraz pozostawania menu pauzy.

To alpha, nie ukończony port. Nie wykonano pełnego meczu, pełnej ścieżki strzału,
obrony ani sezonu kariery nowym sterowaniem. Brak testu alpha3 na fizycznym Androidzie.
Oryginalne ekrany technik, pojedynków, minigry i kariery nie mają jeszcze pełnego
mobilnego przeprojektowania. Kamera pozostaje kamerą silnika z przyciskiem zoom;
nie dodano gestu pinch/pan ani listy rozstrzygającej blisko stojących zawodników.
Przy małym ekranie czytelność kart wymaga dalszego dopracowania. Czasowe minigry
nie mają jeszcze odrębnego mobilnego systemu zatrzymania na pointerdown.

Nie zmieniano instalacji źródłowych na D: ani snapshotu. APK zachowuje identyfikator
istniejącej wersji alpha, klucz podpisu i origin zapisów. Weryfikator paczki sprawdza
podpis, wyrównanie oraz zgodność każdego zasobu z www; nie zastępuje testu Androida.

## Finalna paczka — 17 października 2026

Zakończono budowanie alpha3 z ostatnimi poprawkami. Ponownie przeszło 30/30 testów.
Weryfikacja APK: poprawny podpis v2/v3, wyrównanie oraz zgodność wszystkich 6661
zasobów z katalogiem www. Rozmiar: 1 651 239 393 bajty (około 1,65 GB).
SHA256: B0BB33DCB2BD553A616B445474C11A0E9DCE628AE81432FD690C2A854F0B85FF.
Raport maszynowy: dist/Tsubasa-Offline-0.3.0-alpha3.apk.verification.json.
Wyniki przeglądarkowe powyżej pochodzą z 7 października; testów Androida nadal nie wykonano.
