import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:intellicare_frontend/src/Program/Basic%20Fitness%20Tests/HomeScanning/HomeScanningCamera.dart';
import 'package:intellicare_frontend/src/Program/utils/image_string.dart';
import 'package:intellicare_frontend/src/Widgets/app_bar_with_back_button.dart';
import 'package:intellicare_frontend/src/Widgets/button.dart';
import 'package:intellicare_frontend/utils/impersonation_guard.dart';

class HomeScanningHomePage extends StatelessWidget {
  const HomeScanningHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBarWithBackButton(titleKey: tr('home_scanning.app_bar_title')),
      body: SingleChildScrollView(
        child: Center(
          child: Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  ImageString.homescanLogo,
                  height: 240,
                  width: double.infinity,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 20),

                Text(
                  tr('home_scanning.intro_description'),
                  style: const TextStyle(fontSize: 24),
                ),

                const SizedBox(height: 120),

                Button(
                  text: tr('home_scanning.start_test'),
                  fontSize: 18,
                  onPressed: () {
                    if (blockIfImpersonating(context)) return;
                    Navigator.pushNamed(
                      context,
                      HomeScanningCamera.routeName,
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}