# PerfectXI

Android version of Perfect XI — port offline z wariantami **Python + JavaScript**
oraz **Java + JavaScript**.

## Stan projektu

Wariant Python ma serwer zasobów, integrację z Android WebView przez
python-for-android/PyJNIus, skrypt przygotowania i budowania paczki oraz testy.
**APK Python nie został jeszcze zbudowany ani sprawdzony na Androidzie.**
Lokalnie sprawdzono zapis po przeładowaniu i początek meczu w przeglądarce.

Wariant Java jest zachowany jako alternatywa. Wcześniejszą wersję alpha1
uruchomiono na emulatorze; alpha2 z nowym intro wymaga dalszych testów.
Żaden z tych wyników nie potwierdza pełnej gry na telefonie.

## Zawartość repozytorium

- [Wariant Python](android-port/python-port/README.md): podgląd Windows,
  lokalny serwer i przygotowanie APK na Linux.
- [Wariant Java i wspólne adaptery](android-port/README.md): źródła Java,
  adaptery JS, narzędzia przygotowania gry i diagnostyka.
- `android-port/tests`: testy JS i kontrolowane scenariusze przeglądarkowe.
- `android-port/python-port/tests`: testy rzeczywistych żądań HTTP do serwera Python.

Repozytorium zawiera kod portu. Oryginalna instalacja gry, grafiki, dźwięki, filmy,
wygenerowane `www`, APK, zapisy i klucze podpisywania nie są dołączone.
Do uruchomienia gry trzeba dostarczyć własną zgodną instalację PerfectXI.
Skrypt przygotowania zatrzyma się, jeśli zmieniły się fragmenty kodu gry,
do których stosuje poprawki mobilne.

## Przygotowanie gry na Windows

Wymagane: Node.js, PowerShell 7 oraz FFmpeg z enkoderem `libopenh264`.
Polecenia uruchamiaj z katalogu repozytorium:

```powershell
node android-port/tools/snapshot-source.cjs 'D:/sciezka/do/PerfectXI'
./android-port/tools/prepare-intro.ps1 -Ffmpeg 'C:/sciezka/do/ffmpeg.exe'
node android-port/tools/build.cjs
./android-port/python-port/preview.ps1 -Python 'C:/sciezka/do/python.exe'
```

Snapshot nie nadpisuje istniejącego `source-snapshot`. Po przygotowaniu otwórz
`http://127.0.0.1:18765/`. Podgląd wymaga Pythona 3.11+.
Nie zmieniaj portu właściwej gry bez uwzględnienia zapisów przypisanych do originu.

Budowanie APK Python wymaga Linux, SDK/NDK i python-for-android;
[instrukcja](android-port/python-port/README.md#budowanie-apk--linux).
Budowanie APK Java korzysta z `android-port/tools/build-apk.ps1`.
Obie aplikacje mają osobne identyfikatory i osobne zapisy.

## Testy

Bez instalacji i zasobów gry można uruchomić:

```text
python -m unittest discover -s android-port/python-port/tests -v
node --test android-port/tests/storage.test.cjs android-port/tests/intro.test.cjs
```

Po przygotowaniu `www` można wykonać pełny zestaw JS:

```text
node --test android-port/tests/*.test.cjs
```

Raporty z 5–7 października 2026 opisują lokalne testy określonych wersji.
Nie zastępują ponownego sprawdzenia nowo zbudowanego APK.
