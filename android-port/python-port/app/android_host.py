"""Android settings and lifecycle in Python, via the p4a WebView bootstrap.

Imported only on Android. Retain callback objects while Java holds references.
"""
_callbacks = []


def configure():
    from jnius import autoclass, PythonJavaClass, java_method
    from threading import Event

    activity = autoclass('org.kivy.android.PythonActivity').mActivity
    ready = Event()
    failures = []

    class Lifecycle(PythonJavaClass):
        __javainterfaces__ = ['android/app/Application$ActivityLifecycleCallbacks']
        __javacontext__ = 'app'

        def __init__(self, web):
            super().__init__()
            self.web = web

        @java_method('(Landroid/app/Activity;)V')
        def onActivityPaused(self, current):
            if current.equals(activity):
                self.web.onPause()
                self.web.pauseTimers()

        @java_method('(Landroid/app/Activity;)V')
        def onActivityResumed(self, current):
            if current.equals(activity):
                self.web.onResume()
                self.web.resumeTimers()

        @java_method('(Landroid/app/Activity;Landroid/os/Bundle;)V')
        def onActivityCreated(self, current, state):
            pass

        @java_method('(Landroid/app/Activity;)V')
        def onActivityStarted(self, current):
            pass

        @java_method('(Landroid/app/Activity;)V')
        def onActivityStopped(self, current):
            pass

        @java_method('(Landroid/app/Activity;Landroid/os/Bundle;)V')
        def onActivitySaveInstanceState(self, current, state):
            pass

        @java_method('(Landroid/app/Activity;)V')
        def onActivityDestroyed(self, current):
            if current.equals(activity):
                activity.getApplication().unregisterActivityLifecycleCallbacks(self)

    class Setup(PythonJavaClass):
        __javainterfaces__ = ['java/lang/Runnable']
        __javacontext__ = 'app'

        @java_method('()V')
        def run(self):
            try:
                self.apply_settings()
            except Exception as error:
                failures.append(error)
            finally:
                ready.set()

        def apply_settings(self):
            from jnius import cast
            web = cast('android.webkit.WebView', activity.getLayout().getChildAt(0))
            settings = web.getSettings()
            settings.setJavaScriptEnabled(True)
            settings.setDomStorageEnabled(True)
            settings.setMediaPlaybackRequiresUserGesture(False)
            settings.setAllowFileAccess(False)
            settings.setAllowContentAccess(False)
            settings.setMixedContentMode(1)  # MIXED_CONTENT_NEVER_ALLOW
            activity.getWindow().addFlags(128)  # FLAG_KEEP_SCREEN_ON
            activity.getWindow().getDecorView().setSystemUiVisibility(5894)
            listener = Lifecycle(web)
            _callbacks.append(listener)
            activity.getApplication().registerActivityLifecycleCallbacks(listener)

    setup = Setup()
    _callbacks.append(setup)
    activity.runOnUiThread(setup)
    if not ready.wait(15):
        raise RuntimeError('Android WebView setup timed out')
    if failures:
        raise RuntimeError('Android WebView setup failed') from failures[0]
