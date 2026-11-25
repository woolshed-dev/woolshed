cask "woolshed" do
  arch arm: "aarch64", intel: "x86_64"

  version "0.1.8"
  sha256 arm:   "7afdb108a7847c109e56046c124739da157106823e13d441bc97a42815d8b6f7",
         intel: "6c16b48a001931ca3e33966a75a52ea8fdf3ea2ef083bc5648bef829a62263db"

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
