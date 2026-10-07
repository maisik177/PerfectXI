# Tsubasa Python — osobny wariant Android

Stan 7 października 2026: implementacja Pythona i lokalne testy przeglądarkowe.
**Nie zbudowano jeszcze APK Python ani nie przetestowano go na Androidzie.**
Ten komputer nie ma zainstalowanego WSL ani Dockera; python-for-android wymaga
innego środowiska budowania niż natywny Windows. Obecna wersja Java pozostaje dostępna.

## Jak działa

- Gra, adapter zasobów, zapis i intro pozostają w istniejącym JavaScript.
- `app/server.py`: serwer plików na `127.0.0.1:18765`, MIME, GET/HEAD,
  zakresy bajtów dla filmów, przesyłanie w blokach, kontrola ścieżek i Host.
- `app/android_host.py`: ustawienia WebView i pauzowanie/wznawianie przez PyJNIus.
- `app/main.py`: wejście Androida i podgląd Windows.
- `build.py`: osobne przygotowanie zasobów, manifest SHA256, diagnostyka wymagań,
  kompilacja przez python-for-android i sprawdzenie podpisu/identyfikatora/wyrównania APK.

Własny kod tej wersji jest w Pythonie i JS. Biblioteka python-for-android nadal
dostarcza natywną część Java/C; nie jest to Android pozbawiony tych technologii.
Nie używamy Kivy do rysowania interfejsu — istniejąca gra działa w WebView.

## Wersja Java i zapisy

Nie zmieniono `../native`, `../tools/build-apk.ps1`, podpisu ani dotychczasowych APK.
Dotychczasowy proces budowania Java działa osobno.

| | Java | Python |
|---|---|---|
| Identyfikator aplikacji | `pl.tsubasa.offline.preview` | `pl.tsubasa.offline.pythonpreview` |
| Źródło zasobów | HTTPS przechwytywany z APK | lokalny HTTP w Pythonie |
| Adres gry | `https://appassets.androidplatform.net/assets/` | `http://127.0.0.1:18765/` |
| Wynik budowania | `../dist` | `dist/stage-*/` |

Osobne identyfikatory pozwalają zainstalować oba warianty obok siebie.
Zapisy są osobne; migracja Java → Python nie została wykonana. Nie zmieniaj
adresu ani portu w aplikacji: localStorage i IndexedDB zależą od originu.
Nie odinstalowuj wersji Java w celu testowania wariantu Python.

## Podgląd na Windows

Z głównego folderu projektu:

```powershell
.\android-port\python-port\preview.ps1
```

Otwórz `http://127.0.0.1:18765/`. Zatrzymanie: Ctrl+C w terminalu.
Launcher korzysta z dołączonego Pythona Codex, jeśli jest dostępny; własny interpreter
można wskazać parametrem `-Python 'C:\sciezka\python.exe'`. Wymagany Python 3.11+.
Podgląd używa `../www` bez zmieniania go. JS buduje się dotychczasowym
`node android-port/tools/build.cjs`, gdy aktualizujesz źródła adapterów.

## Testy

Z folderu `python-port` z interpreterem Python 3.11+:

```text
python -m unittest discover -s tests -v
python build.py prepare
python build.py doctor
```

`prepare` tworzy nowy katalog `build/stage-*/private`, kopiuje przygotowane zasoby,
porównuje ich SHA256 i zapisuje manifest. Nie usuwa poprzednich przygotowań.
Całość gry zajmuje kilka GB; kolejne przygotowania zajmują dodatkowe miejsce.

Kontrolowane testy przeglądarkowe korzystają z istniejących scenariuszy w `../tests`:

```text
python app/main.py --port 8174 --probes
python app/main.py --port 8175 --probes
```

Uruchom powyższe w osobnych terminalach. Adresy:
`http://127.0.0.1:8174/__storage-test.html` i
`http://127.0.0.1:8175/__match-test.html`.
Te porty są wyłącznie dla danych testowych. Test meczu programowo przechodzi sceny,
nie sprawdza ręcznego sterowania ani całego spotkania. Strony testowe nie trafiają do APK.

W tym przebiegu potwierdzono zapis po przeładowaniu oraz start Japonia–Brazylia
z 22 uczestnikami i turą AI Rivaula. Późniejszy log HTTP zawierał brak grafiki
`img/pictures/Commentator_MisatoAkasaka_Full.png` (404); nie potwierdzono wpływu
tego braku na dalszy mecz. Szczegóły zakresu w `verification-2026-10-07.json`.

## Budowanie APK — Linux

Ścieżka kompilacji jest przygotowana, ale jeszcze niezweryfikowana pełnym buildem.
Potrzebne: Linux/WSL2/VM, Python 3.11+, JDK 17, narzędzia kompilacji C/C++, Android
SDK platform 35 i build-tools 36.0.0 dla Linux oraz NDK r28c.
SDK z Windows nie zastępuje SDK Linux. Pracuj w linuksowym systemie plików.

Zainstaluj zależności systemowe zgodnie z dokumentacją p4a, następnie w katalogu portu:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-build.txt
python build.py doctor --sdk /sciezka/android-sdk --ndk /sciezka/android-ndk-r28c
python build.py apk --sdk /sciezka/android-sdk --ndk /sciezka/android-ndk-r28c
```

Domyślna architektura to `arm64-v8a`; dla zgodnego emulatora można wybrać `--arch x86_64`.
Wynik to debug APK z osobnym identyfikatorem, nie wydanie do sklepu.
Budowanie korzysta z przygotowanego `../www`; na Linux przenieś cały folder
`android-port/python-port` i `android-port/www` z zachowaniem relacji katalogów.
Skrypt zatrzymuje się przy brakujących wymaganiach zamiast deklarować sukces.

## Różnice i dalsza weryfikacja

- Wstecz obsługuje standardowy bootstrap p4a: historia WebView lub dwukrotne
  naciśnięcie, aby wyjść. Nie ma jeszcze pytania identycznego jak w wersji Java.
- Manifest p4a wymaga INTERNET do połączenia z lokalnym serwerem i dopuszcza HTTP.
  Serwer słucha tylko na loopback; CSP ogranicza żądania zasobów strony do lokalnych
  i osadzonych. Nie jest to pełna zapora sieciowa aplikacji ani blokada każdej nawigacji.
- Zasoby są rozpakowywane przez p4a do prywatnego katalogu przy pierwszym starcie;
  należy zmierzyć czas startu i zajęte miejsce na telefonie.
- Ustawienia PyJNIus, pauza/powrót, dźwięk i intro wymagają testu rzeczywistego APK.
- Trzeba sprawdzić pełny mecz, karierę i aktualizację APK z zachowaniem zapisu.
- Interfejs mobilny z `../mobile-gui` pozostaje oddzielnym prototypem; ta zmiana
  nie podłącza go do silnika meczu.

Dokumentacja podstawy:
[python-for-android WebView](https://python-for-android.readthedocs.io/en/latest/buildoptions.html#webview),
[wymagania budowania](https://python-for-android.readthedocs.io/en/latest/quickstart.html).
