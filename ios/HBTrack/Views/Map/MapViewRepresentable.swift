import SwiftUI
import MapKit

struct MapViewRepresentable: UIViewRepresentable {
    @ObservedObject var viewModel: MapViewModel
    
    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.setRegion(viewModel.region, animated: false)
        mapView.showsUserLocation = true
        mapView.register(MKAnnotationView.self, forAnnotationViewWithReuseIdentifier: "TransmitterAnnotation")
        
        let tapGesture = UITapGestureRecognizer(target: context.coordinator, action: #selector(context.coordinator.handleTap(_:)))
        mapView.addGestureRecognizer(tapGesture)
        
        return mapView
    }
    
    func updateUIView(_ uiView: MKMapView, context: Context) {
        // Update Map Style
        switch viewModel.mapStyle {
        case .standard: uiView.mapType = .standard
        case .satellite: uiView.mapType = .satellite
        case .hybrid: uiView.mapType = .hybrid
        }
        
        // Sync Region (avoid feedback loops if user is panning)
        // In a full implementation, you'd want to separate programmatic flying vs user panning.
        // uiView.setRegion(viewModel.region, animated: true)
        
        // Update Annotations
        let currentAnnotations = uiView.annotations.compactMap { $0 as? CustomPointAnnotation }
        let newIds = Set(viewModel.annotations.map { $0.id })
        
        // Remove old
        let toRemove = currentAnnotations.filter { !newIds.contains($0.annotationModel.id) }
        uiView.removeAnnotations(toRemove)
        
        // Add new
        let currentIds = Set(currentAnnotations.map { $0.annotationModel.id })
        let toAdd = viewModel.annotations.filter { !currentIds.contains($0.id) }
        
        let newPointAnnotations = toAdd.map { model -> CustomPointAnnotation in
            let ann = CustomPointAnnotation(annotationModel: model)
            ann.coordinate = model.coordinate
            return ann
        }
        uiView.addAnnotations(newPointAnnotations)
        
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
                let identifier = "TransmitterAnnotation"
                var view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                
                if view == nil {
                    view = MKAnnotationView(annotation: customAnnotation, reuseIdentifier: identifier)
                    view?.canShowCallout = false
                } else {
                    view?.annotation = customAnnotation
                }
                
                // Use SwiftUI view inside MKAnnotationView
                let swiftUIView = TransmitterAnnotation(
                    annotation: customAnnotation.annotationModel,
                    isSelected: parent.viewModel.selectedTransmitter?.id == customAnnotation.annotationModel.transmitter.id
                )
                
                let hostingController = UIHostingController(rootView: swiftUIView)
                hostingController.view.backgroundColor = .clear
                hostingController.view.frame = CGRect(x: 0, y: 0, width: 30, height: 30)
                
                view?.subviews.forEach { $0.removeFromSuperview() }
                view?.addSubview(hostingController.view)
                view?.frame = hostingController.view.frame
                
                return view
            }
            
            if annotation.title == "measure_point" {
                let identifier = "MeasurePoint"
                var view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                if view == nil {
                    view = MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)
                }
                let circleView = UIView(frame: CGRect(x: 0, y: 0, width: 10, height: 10))
                circleView.backgroundColor = .systemBlue
                circleView.layer.cornerRadius = 5
                circleView.layer.borderColor = UIColor.white.cgColor
                circleView.layer.borderWidth = 2
                
                view?.subviews.forEach { $0.removeFromSuperview() }
                view?.addSubview(circleView)
                view?.frame = circleView.frame
                return view
            }
            
            return nil
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
        
        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            if let customAnnotation = view.annotation as? CustomPointAnnotation {
                DispatchQueue.main.async {
                    self.parent.viewModel.selectTransmitter(customAnnotation.annotationModel)
                }
            }
        }
        
        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            DispatchQueue.main.async {
                self.parent.viewModel.region = mapView.region
            }
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
