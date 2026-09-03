// nearprint-locate: CoreLocation + MapKit helper for NearPrint.
//   nearprint-locate locate                      -> {lat, lon, accuracy_m, source}
//   nearprint-locate reverse <lat> <lon>          -> {address}
//   nearprint-locate geocode "<address>"          -> {lat, lon, address}
//   nearprint-locate search "<query>" <lat> <lon> <radius_m> -> [{name, address, phone, url, lat, lon, distance_m, category}]
import Foundation
import CoreLocation
import MapKit

func emit(_ obj: Any) {
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
func fail(_ msg: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(code)
}
func spin(timeout: TimeInterval, until done: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while !done() && Date() < deadline {
        RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }
    return done()
}

final class Locator: NSObject, CLLocationManagerDelegate {
    let mgr = CLLocationManager()
    var location: CLLocation?
    var error: Error?
    var finished = false
    func run(timeout: TimeInterval) -> CLLocation? {
        mgr.delegate = self
        mgr.desiredAccuracy = kCLLocationAccuracyHundredMeters
        mgr.requestWhenInUseAuthorization()
        mgr.startUpdatingLocation()
        _ = spin(timeout: timeout) { self.finished }
        mgr.stopUpdatingLocation()
        return location
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.last; finished = true
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        self.error = error; finished = true
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let s = manager.authorizationStatus
        if s == .denied || s == .restricted { finished = true }
    }
}

func formatted(_ p: CLPlacemark) -> String {
    var parts: [String] = []
    let street = [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ")
    if !street.isEmpty { parts.append(street) }
    if let c = p.locality { parts.append(c) }
    if let a = p.administrativeArea { parts.append(a) }
    if let z = p.postalCode { parts.append(z) }
    return parts.joined(separator: ", ")
}

func reverse(lat: Double, lon: Double) -> String? {
    var result: String?; var done = false
    CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: lat, longitude: lon)) { marks, _ in
        if let m = marks?.first { result = formatted(m) }
        done = true
    }
    _ = spin(timeout: 10) { done }
    return result
}

func geocode(_ address: String) -> (CLLocation, String)? {
    var result: (CLLocation, String)?; var done = false
    CLGeocoder().geocodeAddressString(address) { marks, _ in
        if let m = marks?.first, let loc = m.location { result = (loc, formatted(m)) }
        done = true
    }
    _ = spin(timeout: 10) { done }
    return result
}

func search(query: String, lat: Double, lon: Double, radius: Double) -> [[String: Any]] {
    let center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
    let req = MKLocalSearch.Request()
    req.naturalLanguageQuery = query
    req.region = MKCoordinateRegion(center: center, latitudinalMeters: radius * 2, longitudinalMeters: radius * 2)
    req.resultTypes = .pointOfInterest
    var items: [MKMapItem]?; var done = false
    MKLocalSearch(request: req).start { resp, _ in items = resp?.mapItems; done = true }
    _ = spin(timeout: 15) { done }
    let origin = CLLocation(latitude: lat, longitude: lon)
    return (items ?? []).map { it in
        let c = it.placemark.coordinate
        let d = CLLocation(latitude: c.latitude, longitude: c.longitude).distance(from: origin)
        var o: [String: Any] = [
            "name": it.name ?? "",
            "lat": c.latitude, "lon": c.longitude,
            "distance_m": Int(d),
            "address": formatted(it.placemark),
        ]
        if let p = it.phoneNumber { o["phone"] = p }
        if let u = it.url { o["url"] = u.absoluteString }
        if let cat = it.pointOfInterestCategory { o["category"] = cat.rawValue }
        return o
    }
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: nearprint-locate locate|reverse|geocode|search ...") }
switch args[1] {
case "locate":
    let l = Locator()
    if let loc = l.run(timeout: 12) {
        emit(["lat": loc.coordinate.latitude, "lon": loc.coordinate.longitude,
              "accuracy_m": Int(loc.horizontalAccuracy), "source": "CoreLocation"])
    } else {
        fail("location unavailable: \(l.error?.localizedDescription ?? "timeout or denied")", code: 2)
    }
case "reverse":
    guard args.count >= 4, let lat = Double(args[2]), let lon = Double(args[3]) else { fail("reverse <lat> <lon>") }
    emit(["address": reverse(lat: lat, lon: lon) ?? ""])
case "geocode":
    guard args.count >= 3 else { fail("geocode <address>") }
    guard let (loc, addr) = geocode(args[2]) else { fail("could not geocode", code: 2) }
    emit(["lat": loc.coordinate.latitude, "lon": loc.coordinate.longitude, "address": addr, "source": "geocode"])
case "search":
    guard args.count >= 6, let lat = Double(args[3]), let lon = Double(args[4]), let r = Double(args[5]) else {
        fail("search <query> <lat> <lon> <radius_m>")
    }
    emit(search(query: args[2], lat: lat, lon: lon, radius: r))
default:
    fail("unknown command \(args[1])")
}
