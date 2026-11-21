import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// The repository root: the web app lives there, the Android project in android/.
val webRoot: File = rootProject.projectDir.parentFile

/**
 * Builds the web app (`npm run build:android`) into this task's output folder, which AGP adds
 * to the APK's assets. The Android counterpart of the Xcode project's "Embed web app" phase.
 * Inputs are the web sources, so Gradle skips it when nothing changed.
 */
abstract class BuildWebApp : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sources: ConfigurableFileCollection

    @get:Internal
    abstract val repoRoot: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val exec: ExecOperations

    @TaskAction
    fun build() {
        val root = repoRoot.get().asFile
        val npm = findNpm()
            ?: throw GradleException(
                "npm was not found. Install Node.js 20.19 or newer (https://nodejs.org), " +
                    "or put its bin folder on PATH, then build again.",
            )
        val path = listOf(npm.parentFile.absolutePath, System.getenv("PATH").orEmpty()).joinToString(File.pathSeparator)
        if (!File(root, "node_modules").isDirectory) {
            exec.exec {
                workingDir = root
                environment("PATH", path)
                commandLine(npm.absolutePath, "ci", "--no-audit", "--no-fund")
            }
        }
        exec.exec {
            workingDir = root
            environment("PATH", path)
            commandLine(npm.absolutePath, "run", "build:android", "--", "--outDir", outputDir.get().asFile.absolutePath)
        }
    }

    /** Android Studio started from the dock has no shell PATH: also look where Node is usually installed. */
    private fun findNpm(): File? {
        val windows = System.getProperty("os.name").lowercase().contains("windows")
        val name = if (windows) "npm.cmd" else "npm"
        val home = System.getProperty("user.home")
        val dirs = buildList {
            System.getenv("NODE_HOME")?.let { add(File(it, "bin")); add(File(it)) }
            System.getenv("PATH")?.split(File.pathSeparator)?.forEach { add(File(it)) }
            add(File("/opt/homebrew/bin"))
            add(File("/usr/local/bin"))
            add(File(home, ".volta/bin"))
            File(home, ".nvm/versions/node").listFiles()
                ?.sortedByDescending { it.name.removePrefix("v").split('.').map { part -> part.toIntOrNull() ?: 0 }.fold(0L) { acc, n -> acc * 1000 + n } }
                ?.forEach { add(File(it, "bin")) }
        }
        return dirs.map { File(it, name) }.firstOrNull { it.canExecute() }
    }
}

val buildWebApp = tasks.register<BuildWebApp>("buildWebApp") {
    group = "build"
    description = "Builds the web app into the APK's assets (npm run build:android)."
    repoRoot.set(webRoot)
    sources.from(
        File(webRoot, "src"),
        File(webRoot, "public"),
        File(webRoot, "pwa"),
        fileTree(File(webRoot, "design")) { exclude("dist/**") },
        File(webRoot, "index.html"),
        File(webRoot, "package.json"),
        File(webRoot, "package-lock.json"),
        File(webRoot, "vite.config.ts"),
        File(webRoot, "tsconfig.json"),
        File(webRoot, "tsconfig.app.json"),
        File(webRoot, "tsconfig.node.json"),
    )
}

// Release signing comes from android/keystore.properties (never committed; see docs/ANDROID.md).
val keystoreFile: File = rootProject.file("keystore.properties")
val keystore = Properties().apply { if (keystoreFile.isFile) keystoreFile.inputStream().use { load(it) } }

android {
    namespace = "com.practicepiano.studio"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.practicepiano.studio"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (keystore.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkDependencies = false
    }

    testOptions {
        unitTests.isReturnDefaultValues = false
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(buildWebApp, BuildWebApp::outputDir)
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
}
