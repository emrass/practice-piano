import CoreAudioKit
import UIKit

/// Presents Apple's Bluetooth LE MIDI browser inside the app, so the piano can be paired
/// without leaving for Settings or Audio MIDI Setup. Once paired, the piano appears as a
/// regular CoreMIDI source and MIDIBridge picks it up automatically.
enum BluetoothMIDIPairing {
    private final class DismissObserver: NSObject, UIAdaptivePresentationControllerDelegate {
        let onDismiss: () -> Void
        init(_ onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
        func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { onDismiss() }
    }

    private static var observer: DismissObserver?

    static func present(from presenter: UIViewController, onDismiss: @escaping () -> Void) {
        let central = CABTMIDICentralViewController()
        if #available(iOS 27, *) {
            // Workaround for a loadView layout crash reported on iOS 27.
            central.tableView = UITableView(frame: .zero, style: .grouped)
        }
        central.navigationItem.title = "Bluetooth MIDI"
        let finish = {
            Self.observer = nil
            onDismiss()
        }
        central.navigationItem.rightBarButtonItem = UIBarButtonItem(
            systemItem: .done,
            primaryAction: UIAction { _ in presenter.dismiss(animated: true, completion: finish) }
        )
        let navigation = UINavigationController(rootViewController: central)
        navigation.modalPresentationStyle = .formSheet
        let dismissObserver = DismissObserver(finish)
        Self.observer = dismissObserver
        navigation.presentationController?.delegate = dismissObserver
        presenter.present(navigation, animated: true)
    }
}
