import SwiftUI
import MapKit

struct MapViewRepresentable: UIViewRepresentable {
    @ObservedObject var viewModel: MapViewModel
    
    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.setRegion(viewModel.region, animated: false)
        mapView.showsUserLocation = true
        mapView.register(PTTBadgeAnnotationView.self, forAnnotationViewWithReuseIdentifier: "PTTBadgeAnnotationView")
        
        let tapGesture = UITapGestureRecognizer(target: context.coordinator, action: #selector(context.coordinator.handleTap(_:)))
        mapView.addGestureRecognizer(tapGesture)
        
        return mapView
    }
    
    func updateUIView(_ uiView: MKMapView, context: Context) {
        // Update Map Style (Default to Hybrid/Satellite matching Screenshots)
        switch viewModel.mapStyle {
        case .standard: uiView.mapType = .standard
        case .satellite: uiView.mapType = .satellite
        case .hybrid: uiView.mapType = .hybrid
        }
        
        // Update Annotations efficiently
        let currentAnnotations = uiView.annotations.compactMap { $0 as? CustomPointAnnotation }
        let currentIds = Set(currentAnnotations.map { $0.annotationModel.id })
        let newIds = Set(viewModel.annotations.map { $0.id })
        
        if currentIds != newIds {
            let toRemove = currentAnnotations.filter { !newIds.contains($0.annotationModel.id) }
            uiView.removeAnnotations(toRemove)
            
            let toAdd = viewModel.annotations.filter { !currentIds.contains($0.id) }
            let newPointAnnotations = toAdd.map { model -> CustomPointAnnotation in
                let ann = CustomPointAnnotation(annotationModel: model)
                ann.coordinate = model.coordinate
                ann.title = model.transmitter.platform_id
                ann.subtitle = model.transmitter.effectiveStatus
                return ann
            }
            uiView.addAnnotations(newPointAnnotations)
        }
        
        // Update Overlays (History Polyline & Measurement)
        uiView.removeOverlays(uiView.overlays)
        
        if viewModel.showHistory && !viewModel.historyPositions.isEmpty {
            let coords = viewModel.historyPositions.map { $0.coordinate }
            let polyline = MKPolyline(coordinates: coords, count: coords.count)
            uiView.addOverlay(polyline)
        }
        
        if viewModel.isMeasuring && !viewModel.measurePoints.isEmpty {
            let measurePolyline = MKPolyline(coordinates: viewModel.measurePoints, count: viewModel.measurePoints.count)
            uiView.addOverlay(measurePolyline)
            
            // Add point markers for measurement
            for point in viewModel.measurePoints {
                let p = MKPointAnnotation()
                p.coordinate = point
                p.title = "measure_point"
                uiView.addAnnotation(p)
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, MKMapViewDelegate {
        var parent: MapViewRepresentable
        
        init(_ parent: MapViewRepresentable) {
            self.parent = parent
        }
        
        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard parent.viewModel.isMeasuring else { return }
            
            let mapView = gesture.view as! MKMapView
            let point = gesture.location(in: mapView)
            let coordinate = mapView.convert(point, toCoordinateFrom: mapView)
            
            DispatchQueue.main.async {
                self.parent.viewModel.addMeasurePoint(coordinate)
            }
        }
        
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if let customAnnotation = annotation as? CustomPointAnnotation {
                let identifier = "PTTBadgeAnnotationView"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier, for: annotation) as? PTTBadgeAnnotationView ?? PTTBadgeAnnotationView(annotation: customAnnotation, reuseIdentifier: identifier)
                view.configure(with: customAnnotation.annotationModel)
                return view
            }
            
            if annotation.title == "measure_point" {
                let identifier = "MeasurePoint"
                let markerView = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: identifier)
                markerView.markerTintColor = .systemBlue
                markerView.glyphImage = UIImage(systemName: "circle.fill")
                markerView.canShowCallout = false
                return markerView
            }
            
            return nil
        }
        
        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            if let customAnnotation = view.annotation as? CustomPointAnnotation {
                DispatchQueue.main.async {
                    self.parent.viewModel.selectTransmitter(customAnnotation.annotationModel.transmitter)
                }
            }
        }
        
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                if parent.viewModel.isMeasuring {
                    renderer.strokeColor = .systemBlue
                    renderer.lineWidth = 3
                    renderer.lineDashPattern = [5, 5]
                } else {
                    renderer.strokeColor = .systemRed
                    renderer.lineWidth = 4
                }
                return renderer
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}

class CustomPointAnnotation: MKPointAnnotation {
    let annotationModel: TransmitterMapAnnotation
    
    init(annotationModel: TransmitterMapAnnotation) {
        self.annotationModel = annotationModel
        super.init()
    }
}

// Custom PTT Badge Pin matching Screenshots 4 & 5
class PTTBadgeAnnotationView: MKAnnotationView {
    private let badgeContainer = UIView()
    private let titleLabel = UILabel()
    private let pinDot = UIView()
    
    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        setupView()
    }
    
    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
        setupView()
    }
    
    private func setupView() {
        canShowCallout = false
        backgroundColor = .clear
        
        // Badge Container
        badgeContainer.backgroundColor = .white
        badgeContainer.layer.cornerRadius = 10
        badgeContainer.layer.borderWidth = 2.0
        badgeContainer.layer.shadowColor = UIColor.black.cgColor
        badgeContainer.layer.shadowOpacity = 0.25
        badgeContainer.layer.shadowOffset = CGSize(width: 0, height: 2)
        badgeContainer.layer.shadowRadius = 3
        
        // Title Label
        titleLabel.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        titleLabel.textColor = .black
        titleLabel.textAlignment = .center
        
        // Pin Dot
        pinDot.layer.cornerRadius = 4
        pinDot.layer.borderColor = UIColor.white.cgColor
        pinDot.layer.borderWidth = 1.5
        
        badgeContainer.addSubview(titleLabel)
        addSubview(badgeContainer)
        addSubview(pinDot)
    }
    
    func configure(with model: TransmitterMapAnnotation) {
        self.annotation = model.coordinate as? MKAnnotation
        let statusColor = model.statusUIColor
        
        titleLabel.text = model.transmitter.platform_id
        titleLabel.sizeToFit()
        
        let labelWidth = max(titleLabel.frame.width + 12, 54)
        let labelHeight: CGFloat = 20
        
        badgeContainer.frame = CGRect(x: -labelWidth / 2, y: -26, width: labelWidth, height: labelHeight)
        badgeContainer.layer.borderColor = statusColor.cgColor
        titleLabel.frame = CGRect(x: 0, y: 0, width: labelWidth, height: labelHeight)
        
        pinDot.frame = CGRect(x: -4, y: -4, width: 8, height: 8)
        pinDot.backgroundColor = statusColor
        
        self.frame = CGRect(x: 0, y: 0, width: labelWidth, height: 30)
        self.centerOffset = CGPoint(x: 0, y: 0)
    }
}
