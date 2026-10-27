import AppKit

/// The menu bar, built in code (no storyboard). The Edit menu matters beyond
/// looks: without it, Cmd-C/V/Z never reach the web editor's text fields.
enum MainMenu {
    static func make() -> NSMenu {
        let main = NSMenu()
        let appName = ProcessInfo.processInfo.processName

        main.addSubmenu("", [
            item("About \(appName)", #selector(AppDelegate.showAbout(_:))),
            item("Check for Updates…", #selector(AppDelegate.checkForUpdates(_:))),
            .separator(),
            item("GitHub Account…", #selector(AppDelegate.showGitHubAccount(_:))),
            .separator(),
            item("Hide \(appName)", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:))),
            .separator(),
            item("Quit \(appName)", #selector(NSApplication.terminate(_:)), "q"),
        ])

        // AppKit fills an "Open Recent" submenu that contains Clear Menu.
        let recent = NSMenu(title: "Open Recent")
        recent.addItem(item("Clear Menu", #selector(NSDocumentController.clearRecentDocuments(_:))))
        let recentItem = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
        recentItem.submenu = recent
        main.addSubmenu("File", [
            item("New Site…", #selector(AppDelegate.newSite(_:)), "n", [.command, .shift]),
            item("New…", #selector(EditorWindowController.newItem(_:)), "n"),
            item("Open…", #selector(NSDocumentController.openDocument(_:)), "o"),
            recentItem,
            .separator(),
            item("Go to…", #selector(EditorWindowController.showGoTo(_:)), "k"),
            item("Save", #selector(EditorWindowController.saveEdits(_:)), "s"),
            item("Publish…", #selector(EditorWindowController.showPublish(_:)), "p", [.command, .shift]),
            item("Update Site…", #selector(EditorWindowController.updateSite(_:))),
            item("Coding Agents…", #selector(EditorWindowController.showCodingAgents(_:))),
            item("Connect Domain…", #selector(EditorWindowController.connectDomain(_:))),
            item("Backups…", #selector(EditorWindowController.showBackups(_:)), "b", [.command, .shift]),
            .separator(),
            item("Close", #selector(NSWindow.performClose(_:)), "w"),
            .separator(),
            item("Delete Site…", #selector(EditorWindowController.deleteSite(_:))),
        ])

        main.addSubmenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Paste and Match Style", #selector(NSTextView.pasteAsPlainText(_:)), "v", [.command, .option, .shift]),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])

        main.addSubmenu("View", [
            item("Desktop", #selector(EditorWindowController.previewDesktop(_:)), "1"),
            item("Tablet", #selector(EditorWindowController.previewTablet(_:)), "2"),
            item("Mobile", #selector(EditorWindowController.previewMobile(_:)), "3"),
            .separator(),
            item("Open on Live Site", #selector(EditorWindowController.openLiveSite(_:)), "l", [.command, .option]),
            item("Change Live Site Address…", #selector(EditorWindowController.changeLiveSiteAddress(_:))),
            .separator(),
            item("Reload Editor", #selector(EditorWindowController.reloadEditor(_:)), "r"),
            item("Open Classic Editor", #selector(EditorWindowController.openClassicEditor(_:))),
            .separator(),
            item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
        ])

        let window = main.addSubmenu("Window", [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Zoom", #selector(NSWindow.performZoom(_:))),
            .separator(),
            item("Bring All to Front", #selector(NSApplication.arrangeInFront(_:))),
        ])
        NSApp.windowsMenu = window

        NSApp.helpMenu = main.addSubmenu("Help", [
            item("Profolio Tour", #selector(EditorWindowController.showTutorial(_:))),
            item("Send Feedback…", #selector(AppDelegate.sendFeedback(_:))),
        ])
        return main
    }

    private static func item(_ title: String, _ action: Selector, _ key: String = "",
                             _ modifiers: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        if !key.isEmpty { item.keyEquivalentModifierMask = modifiers }
        return item
    }
}

private extension NSMenu {
    @discardableResult
    func addSubmenu(_ title: String, _ items: [NSMenuItem]) -> NSMenu {
        let menu = NSMenu(title: title)
        items.forEach(menu.addItem)
        let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        holder.submenu = menu
        addItem(holder)
        return menu
    }
}
