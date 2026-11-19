cask "woolshed" do
  arch arm: "aarch64", intel: "x86_64"

  version "0.1.7"
  sha256 arm:   "2b4f7164767b1960710315c07650fe0d4d58750addc1d0985b572c57bddd0734",
         intel: "3ab59e39b8c75dcc3d48630fee620344f4691a7172ea0d5a435eb90f7c461120"

  url "https://woolshed.dev/releases/app/#{version}/woolshed-macos-#{arch}.tar.gz"

  name "Woolshed"
  desc "Desktop app for running coding agents in terminals"
  homepage "https://woolshed.dev"

  livecheck do
    url "https://woolshed.dev/releases/app/latest.json"
    strategy :json do |json|
      json["version"]
    end
  end

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "Woolshed.app"
  binary "#{appdir}/Woolshed.app/Contents/MacOS/Woolshed", target: "woolshed"

  zap trash: [
    "~/.config/woolshed",
    "~/.config/woolshed-core",
    "~/.local/bin/woolshed",
    "~/.local/bin/woolshed-core",
    "~/.local/share/woolshed-core",
    "~/.local/state/woolshed-core",
    "~/Library/Caches/dev.woolshed.app",
    "~/Library/Preferences/dev.woolshed.app.plist",
    "~/Library/Saved Application State/dev.woolshed.app.savedState",
  ]
end
