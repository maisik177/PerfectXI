# Captain Tsubasa — Android offline

Osobny wariant **Python + JavaScript**: [python-port/README.md](python-port/README.md).
Ma własny kod serwera, przygotowanie paczki i testy lokalne; APK Python jeszcze nie zbudowano.
Poniższa dokumentacja i dotychczasowe APK dotyczą zachowanej wersji Java.

Stan: 7 października 2026 — APK 0.2.0-alpha2 z nowym odtwarzaczem intro. Poprzednią alpha1 sprawdzono na BlueStacks: instalacja, ekran tytułowy i Game Modes działały po pominięciu uszkodzonego odtwarzania. Alpha2 wymaga nowego testu emulatora. Meczu na Androidzie jeszcze nie zweryfikowano. Sterowanie nie zostało dostosowane.

## APK i diagnostyka

Źródłem portu jest teraz lokalna kopia `source-snapshot/`, wykonana 7 października 2026: 6808 plików, 2 442 446 228 bajtów. Każdy skopiowany plik porównano z oryginałem przez SHA256; spis znajduje się w `source-snapshot-manifest.json`. Skrypty budowania i przygotowania intro domyślnie korzystają z tej kopii. Folder `D:\irch\captain-tsubasa-perfectxi` można aktualizować i odłączyć od projektu bez wpływu na tę wersję portu. Nową wersję źródeł należy później integrować świadomie, zamiast nadpisywać kopię.

Pakiet: `dist/Tsubasa-Offline-0.2.0-alpha2.apk`. Wymaga Androida 8.0 lub nowszego oraz WebView obsługującego silnik gry. To lokalnie podpisana wersja alpha. Zachowaj `.signing/alpha.keystore`, aby kolejne wersje można było podpisywać tym samym kluczem; katalog jest wyłączony z Git.

Natywne opakowanie ładuje zasoby z APK pod stałym originem HTTPS, obsługuje żądania zakresów dla multimediów, poziomy ekran i pauzowanie WebView w tle. Manifest nie przyznaje uprawnienia INTERNET. Przycisk Wstecz pyta o wyjście; nie zapisuje automatycznie kariery. Logi JavaScript trafiają do ADB jako `TsubasaWeb`, a błędy zasobów jako `TsubasaAssets`.

Budowanie i niezależna kontrola paczki (PowerShell 7, Node, JDK 21, Android SDK z platformą 35 i build-tools 36.0.0):

```powershell
./android-port/tools/prepare-intro.ps1
./android-port/tools/build-apk.ps1
./android-port/tools/verify-apk.ps1
```

`prepare-intro.ps1` uruchamia lokalny FFmpeg z enkoderem `libopenh264` (parametr `-Ffmpeg`) i tworzy `mobile-media/`. Domyślnie korzysta z FFmpeg dołączonego do BlueStacks. Parametr `-Source` pozwala wskazać instalację źródłową. Konwersję trzeba powtórzyć po zmianie filmów źródłowych; builder kontroluje sumy SHA256 obu źródeł i wyników.

Alpha2 zawiera pełne intro 1 i 2 w 1280×720, H.264 Baseline, 30 fps, ze ścieżką AAC skopiowaną bez ponownego kodowania. Pliki mają około 25,2 i 27,6 MB. Metadane MP4 są przed danymi filmu (`faststart`). Nowy plugin `Tsubasa_MobileIntro` pobiera lokalny plik przez `fetch` i odtwarza go z URL typu Blob, omijając żądania zakresów odtwarzacza do skompresowanych zasobów APK. Dźwięk i obraz mają wspólny zegar odtwarzacza; nie jest uruchamiany osobny soundtrack OGG. Zakończenie, pominięcie i zmiana sceny usuwają źródło filmu, anulują ładowanie i zwalniają Blob. Oryginalne filmy na D: pozostają niezmienione.

Pełne dekodowanie obu filmów oraz obu ścieżek audio przeszło bez błędów w FFmpeg. 23 testy Node obejmują także zakończenie, pominięcie, rotację filmów, powrót z tła i spóźnione zakończenie pobierania. Są to testy kodu z atrapami środowiska; odtwarzanie obrazu/dźwięku w Android WebView i automatyczny powrót do menu **nie zostały jeszcze potwierdzone dla alpha2**, ponieważ emulator nie był dostępny. Faktycznej przyczyny awarii alpha1 nie rozstrzygnięto między dekoderem a transportem wideo; alpha2 zmienia oba te elementy.

Oba skrypty przyjmują parametry `-Sdk` i `-Jdk`. Weryfikator sprawdza podpis, wyrównanie, sumę SHA256, wymagane pliki i zgodność zawartości każdego zasobu z `www`. Raport zapisuje obok APK. Nie jest to test uruchomienia aplikacji.

Po udostępnieniu BlueStacks z ADB wybierz konkretny identyfikator z `adb devices -l`. Po odtworzeniu błędu zbierz diagnostykę:

```powershell
./android-port/tools/collect-android-logs.ps1 -Serial 'IDENTYFIKATOR_Z_ADB'
```

Skrypt zapisuje logi gry, dane pakietu, pamięci i WebView w `diagnostics/`. Nie czyści logów ani zapisów. Uruchomiono go pomyślnie na BlueStacks z Androidem 11. Logi mogą zawierać dane z działania gry — przejrzyj je przed udostępnieniem.

Podczas pierwszej instalacji Android 11 odrzucił skompresowany `resources.arsc` (błąd -124). Builder został poprawiony: tabela zasobów jest nieskompresowana i wyrównana do 4 bajtów. Zaktualizowany APK zainstalował się poprawnie. Weryfikator dodatkowo kontroluje ten warunek. Pierwszy test nie potwierdził reakcji ekranu wyboru języka na wejście ADB; wymaga to dalszej diagnostyki fokusu i aktualizacji scen.

## Wykonano

- Osobny katalog roboczy. Oryginalna instalacja na D: pozostaje bez zmian.
- Builder kopiuje webowe katalogi gry, bez EXE/DLL, desktopowego runtime i katalogu zapisów.
- Manifest 6211 plików grafik/audio/filmów i adapter rozpoznający istniejące ścieżki bez Node.js.
- Obsługa PNG/JPG/WEBP i formatów audio, nazw ze spacjami, wielkości liter oraz jednoznacznych nazw grafik w podfolderach. Niejednoznaczne aliasy zgłaszają ostrzeżenie zamiast wybierać dowolny plik.
- Wyłączone 12 pluginów transportu/rozgrywki online oraz MCP_Debug; biblioteka PeerJS nie jest ładowana.
- Z listy trybów usunięto Online Play i desktopowe Exit. Nie jest to zapora sieciowa ani audyt wszystkich połączeń sieciowych pozostałych pluginów.
- Skalowanie całego obrazu do okna z zachowaniem proporcji i mapowania współrzędnych RPG Maker. Pełna obsługa wcięć i ergonomii dotyku pozostaje do zrobienia.
- Poprawka rzeczywiście zaobserwowanego błędu: opóźniony callback tła tytułu odczytywał getter scale z usuniętego sprite'a PIXI. Najpierw sprawdzamy transform.

## Budowanie i testy

Uruchom z katalogu głównego projektu w PowerShell:

```powershell
node android-port/tools/build.cjs
node --test android-port/tests/assets.test.cjs android-port/tests/storage.test.cjs
node android-port/tools/serve.cjs
```

Podgląd: http://127.0.0.1:8173 — wyłącznie na lokalnym komputerze. Serwer nie jest przeznaczony do publikacji. Zatrzymanie: Ctrl+C.

Inna instalacja źródłowa:

```powershell
node android-port/tools/build.cjs 'D:/inna-instalacja'
```

`runtime/` i `tools/` są źródłem zmian. `www/` jest wynikiem budowania; nie edytuj go ręcznie. Builder nadpisuje pliki, lecz nie usuwa osieroconych zasobów po zmianie źródła. Przed finalnym wydaniem należy dodać budowanie do świeżego katalogu i kontrolę integralności paczki. Poprawki tekstowe wymagają dokładnie jednego zgodnego miejsca; po zmianie kodu upstream build zatrzyma się, zamiast podmienić przypadkowy fragment.

## Weryfikacja

17 testów Node obejmuje zasoby, callback usuniętego sprite'a, zapis Dream/Success, błędy magazynu, ochronę uszkodzonych danych i wyjście po zapisie, pierwszeństwo aktualnych ikon oraz obsługę awarii intro. Sprawdzono również składnię wygenerowanego Soccer_MatchScene i adaptera zapisu.

Kolejny test Androida ujawnił nieobsłużony `LoadError` filmu otwierającego. Adapter przechwytuje błąd tylko w scenie intro, zatrzymuje multimedia i przechodzi do ekranu tytułowego. To obejście niedziałającego odtwarzania, nie potwierdzenie obsługi kodeka filmu. Dla ikon `Mode_*` wybiera istniejące bieżące pliki w `img/pictures/Modes`, przed kopiami `_old_icons`. Hall of Fame bez dołączonej grafiki korzysta z istniejącej karty rysowanej przez grę. Poprawione APK zainstalowano; dalsza weryfikacja działania jest opisana w `tests/android-verification-2026-10-06.json`.

Test przeglądarkowy na osobnym originie 8174 zapisuje dane próbne, przeładowuje stronę i odczytuje je ponownie. Potwierdzono trwałość slotu Success w localStorage oraz Dream w IndexedDB z rzeczywistym StorageManager, kompresją pako i JsonEx. JsonEx zachował prototyp obiektu. Jest to kontrolowana próbna kariera, nie pełny sezon ani migracja zapisów PC.

Test integracyjny na osobnym originie 8175 przechodzi przez rzeczywiste sceny wyboru drużyn, ustawień i składu. Potwierdzono wyrenderowane boisko Japonia–Brazylia z 22 uczestnikami. Po kickoffie aktywny był Rivaul (AI); następnie zegar osiągnął 2:20 i wyświetlono turę Shuna Nitty. Konsola tego przebiegu nie zawierała błędów. Test wywołuje istniejące metody scen i kończy ceremonię programowo; nie stanowi testu wejścia z klawiatury/dotyku ani pełnego meczu. Testowe strony są udostępniane wyłącznie przez serwer deweloperski i nie są kopiowane do paczki www.

Uruchomienie testów przeglądarkowych (dwa osobne terminale):

```powershell
node android-port/tools/serve.cjs 8174
node android-port/tools/serve.cjs 8175
```

Otwórz `http://127.0.0.1:8174/__storage-test.html` oraz `http://127.0.0.1:8175/__match-test.html`. Nie używaj tych originów do właściwej rozgrywki — są zarezerwowane dla danych testowych.

## Zapis w etapie 2

- Dream oczekuje na zakończenie asynchronicznego zapisu. Trzy miejsca w interfejsie dostały obsługę oczekiwania; „zapisz i wyjdź” pozostaje na ekranie przy błędzie. Zachowano wywołanie zapisu globalnego postępu.
- Success korzysta z osobnego klucza localStorage, zachowując synchroniczny interfejs istniejących wywołań. Zmiana cache następuje po udanym zapisie; błędne dane nie są zastępowane pustą tablicą. Wyjście i komunikat o usunięciu sprawdzają rezultat operacji.
- localStorage ma limit pojemności. Przy jego przekroczeniu użytkownik otrzyma komunikat, a dotychczasowy zapis pozostanie. Docelowe duże kariery, importowane portrety i migrację do natywnego magazynu trzeba jeszcze sprawdzić.
- Zapis należy do konkretnego originu przeglądarki/WebView. Zmiana portu/domeny, wyczyszczenie danych aplikacji lub odinstalowanie może odłączyć/usunąć zapis. Nie wykonano migracji PC → Android ani testu aktualizacji APK.

Nie przenoszono zapisów użytkownika. Bezpieczne obszary ekranu oraz pełna obsługa dotyku pozostają do zrobienia. Działanie pauzy, dźwięku, zapisu i powrotu z tła wymaga testów Androida.
