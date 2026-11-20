import 'dart:io';
import 'dart:typed_data';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:intellicare_frontend/services/Program/api_service.dart';
import 'package:intellicare_frontend/src/Widgets/app_bar_with_back_button.dart';
import 'package:intellicare_frontend/src/Widgets/app_snackbar.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import 'package:image_gallery_saver_plus/image_gallery_saver_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:image/image.dart' as img;

class HomeScanningCamera extends StatefulWidget {
  static const routeName = '/home-scanning-camera';

  const HomeScanningCamera({super.key});

  @override
  State<HomeScanningCamera> createState() => _HomeScanningCameraState();
}

class _HomeScanningCameraState extends State<HomeScanningCamera> {
  CameraController? _cameraController;
  List<CameraDescription>? _cameras;
  bool _isCameraInitialized = false;
  bool _isProcessing = false;
  String? _capturedImagePath;
  Uint8List? _backendImageBytes;
  String? _errorMessage;
  bool _isCapturing = false;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras != null && _cameras!.isNotEmpty) {
        _cameraController = CameraController(
          _cameras![0],
          ResolutionPreset.high,
        );

        await _cameraController!.initialize();
        if (mounted) {
          setState(() {
            _isCameraInitialized = true;
          });
        }
      }
    } catch (e) {
      setState(() {
        _errorMessage =
            tr('home_scanning.camera_init_failed', namedArgs: {'error': '$e'});
      });
    }
  }

  Future<String> _fixImageOrientation(String imagePath) async {
    try {
      // Read the image file
      final bytes = await File(imagePath).readAsBytes();

      // Decode the image
      img.Image? image = img.decodeImage(bytes);

      if (image == null) return imagePath;

      // The image package automatically reads and applies EXIF orientation
      // when decoding, but we need to ensure it's baked into the pixels

      // Re-encode the image (this bakes in the orientation)
      final fixedBytes = img.encodeJpg(image, quality: 95);

      // Save the corrected image
      final directory = await getApplicationDocumentsDirectory();
      final fixedPath = path.join(
        directory.path,
        'fixed_${DateTime.now().millisecondsSinceEpoch}.jpg',
      );

      await File(fixedPath).writeAsBytes(fixedBytes);

      return fixedPath;
    } catch (e) {
      print('Error fixing orientation: $e');
      return imagePath; // Return original if fixing fails
    }
  }

  Future<void> _takePicture() async {
    if (_cameraController == null ||
        !_cameraController!.value.isInitialized ||
        _isCapturing) {
      return;
    }

    setState(() {
      _isCapturing = true;
      _isProcessing = true;
      _errorMessage = null;
      _backendImageBytes = null;
    });

    try {
      // Take picture
      final XFile image = await _cameraController!.takePicture();

      // PAUSE CAMERA IMMEDIATELY after taking picture
      await _cameraController?.pausePreview();

      // Fix image orientation before saving
      String fixedImagePath = await _fixImageOrientation(image.path);

      setState(() {
        _capturedImagePath = fixedImagePath;
      });

      // Send the orientation-fixed image to backend
      await _sendToBackend(fixedImagePath);
    } catch (e) {
      setState(() {
        _errorMessage =
            tr('home_scanning.error_generic', namedArgs: {'error': '$e'});
        _isProcessing = false;
        _isCapturing = false;
      });
      _cameraController?.resumePreview();
    }
  }

  Future<void> _sendToBackend(String imagePath) async {
    try {
      final imageBytes = await ProgramApiService.homeScanningInference(imagePath);

      setState(() {
        _backendImageBytes = imageBytes;
        _isProcessing = false;
        _isCapturing = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage =
            tr('home_scanning.error_generic', namedArgs: {'error': '$e'});
        _isProcessing = false;
        _isCapturing = false;
      });
    }
  }

  void _retake() {
    setState(() {
      _capturedImagePath = null;
      _backendImageBytes = null;
      _errorMessage = null;
      _isCapturing = false;
    });

    _cameraController?.resumePreview();
  }

  @override
  void dispose() {
    _cameraController?.pausePreview();
    _cameraController?.dispose();
    _cameraController = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBarWithBackButton(titleKey: tr('home_scanning.home_safety_title')),
      body: _buildBody(),
      backgroundColor: Colors.black,
    );
  }

  Widget _buildBody() {
    if (_errorMessage != null) {
      return _buildErrorView();
    }

    if (_backendImageBytes != null) {
      return _buildResultView();
    }

    if (_capturedImagePath != null && _isProcessing) {
      return _buildProcessingView();
    }

    if (_isCameraInitialized && _cameraController != null) {
      return _buildCameraView();
    }

    return _buildLoadingView();
  }

  Widget _buildCameraView() {
    return Column(
      children: [
        Expanded(child: CameraPreview(_cameraController!)),
        Container(
          padding: const EdgeInsets.all(20),
          color: Colors.black87,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ElevatedButton(
                onPressed: _isProcessing ? null : _takePicture,
                style: ElevatedButton.styleFrom(
                  shape: const CircleBorder(),
                  padding: const EdgeInsets.all(20),
                  backgroundColor: Colors.white,
                ),
                child: const Icon(
                  Icons.camera_alt,
                  size: 40,
                  color: Colors.black,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildProcessingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (_capturedImagePath != null)
            Container(
              margin: const EdgeInsets.all(20),
              constraints: const BoxConstraints(maxHeight: 300),
              child: Image.file(File(_capturedImagePath!)),
            ),
          const SizedBox(height: 30),
          const CircularProgressIndicator(color: Colors.white),
          const SizedBox(height: 20),
          Text(
            tr('home_scanning.processing_image'),
            style: const TextStyle(color: Colors.white, fontSize: 18),
          ),
        ],
      ),
    );
  }

  Future<void> _downloadImage() async {
    if (_backendImageBytes == null) return;

    try {
      if (Platform.isAndroid) {
        final status = await Permission.storage.request();
        if (!status.isGranted) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              AppSnackBar.error(tr('home_scanning.storage_permission_denied')),
            );
          }
          return;
        }
      }

      final result = await ImageGallerySaverPlus.saveImage(
        _backendImageBytes!,
        quality: 100,
        name: "prediction_${DateTime.now().millisecondsSinceEpoch}",
      );

      if (mounted) {
        if (result['isSuccess'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            AppSnackBar.success(tr('home_scanning.image_saved')),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            AppSnackBar.error(tr('home_scanning.save_failed')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          AppSnackBar.error(
            tr('home_scanning.download_error', namedArgs: {'error': '$e'}),
          ),
        );
      }
    }
  }

  Widget _buildResultView() {
    return Column(
      children: [
        const SizedBox(height: 20),
        Expanded(
          child: Container(
            margin: const EdgeInsets.all(20),
            child: Image.memory(_backendImageBytes!, fit: BoxFit.contain),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              ElevatedButton.icon(
                onPressed: _downloadImage,
                icon: const Icon(Icons.download),
                label: Text(tr('home_scanning.download')),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 15,
                  ),
                  backgroundColor: Colors.green,
                ),
              ),
              ElevatedButton.icon(
                onPressed: _retake,
                icon: const Icon(Icons.camera_alt),
                label: Text(tr('home_scanning.retake')),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 15,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Colors.red, size: 60),
            const SizedBox(height: 20),
            Text(
              _errorMessage!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
            const SizedBox(height: 30),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _errorMessage = null;
                });
                _initializeCamera();
              },
              child: Text(tr('home_scanning.retry')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(color: Colors.white),
          const SizedBox(height: 20),
          Text(
            tr('home_scanning.initializing_camera'),
            style: const TextStyle(color: Colors.white, fontSize: 18),
          ),
        ],
      ),
    );
  }
}