import cv2
import numpy as np
from typing import List, Tuple, Optional
import logging
from pathlib import Path


class VideoPanoramaGenerator:
    """Generate panoramas from video files."""

    def __init__(
        self,
        feature_detector: str = "SIFT",
        max_features: int = 1000,
        good_match_percent: float = 0.15,
        frame_skip: int = 5,
    ):
        """
        Initialize the panorama generator.

        Args:
            feature_detector: Type of feature detector ('SIFT', 'ORB', 'AKAZE')
            max_features: Maximum number of features to detect
            good_match_percent: Percentage of good matches to keep
            frame_skip: Skip frames for faster processing
        """
        self.max_features = max_features
        self.good_match_percent = good_match_percent
        self.frame_skip = frame_skip

        # Initialize feature detector
        if feature_detector == "SIFT":
            self.detector = cv2.SIFT_create(nfeatures=max_features)
            self.matcher = cv2.BFMatcher()
        elif feature_detector == "ORB":
            self.detector = cv2.ORB_create(nfeatures=max_features)
            self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        elif feature_detector == "AKAZE":
            self.detector = cv2.AKAZE_create()
            self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        else:
            raise ValueError(f"Unsupported feature detector: {feature_detector}")

        self.feature_detector_type = feature_detector

    def extract_frames(
        self, video_path: str, max_frames: Optional[int] = None
    ) -> List[np.ndarray]:
        """
        Extract frames from video file.

        Args:
            video_path: Path to video file
            max_frames: Maximum number of frames to extract

        Returns:
            List of extracted frames
        """
        cap = cv2.VideoCapture(video_path)
        frames = []
        frame_count = 0
        extracted_count = 0

        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        logging.info(f"Video has {total_frames} total frames")

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Skip frames for faster processing
            if frame_count % self.frame_skip == 0:
                frames.append(frame)
                extracted_count += 1

                if max_frames and extracted_count >= max_frames:
                    break

            frame_count += 1

        cap.release()
        logging.info(f"Extracted {len(frames)} frames from video")
        return frames

    def detect_and_match_features(
        self, img1: np.ndarray, img2: np.ndarray
    ) -> Tuple[List[cv2.KeyPoint], List[cv2.KeyPoint], List[cv2.DMatch]]:
        """
        Detect and match features between two images.

        Args:
            img1: First image
            img2: Second image

        Returns:
            Tuple of (keypoints1, keypoints2, good_matches)
        """
        # Convert to grayscale
        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

        # Detect keypoints and descriptors
        kp1, des1 = self.detector.detectAndCompute(gray1, None)
        kp2, des2 = self.detector.detectAndCompute(gray2, None)

        if des1 is None or des2 is None:
            return [], [], []

        # Match features
        if self.feature_detector_type == "SIFT":
            matches = self.matcher.knnMatch(des1, des2, k=2)
            # Apply ratio test
            good_matches = []
            for match_pair in matches:
                if len(match_pair) == 2:
                    m, n = match_pair
                    if m.distance < 0.7 * n.distance:
                        good_matches.append(m)
        else:
            matches = self.matcher.match(des1, des2)
            # Sort matches by distance
            matches = sorted(matches, key=lambda x: x.distance)
            # Keep only good matches
            num_good_matches = int(len(matches) * self.good_match_percent)
            good_matches = matches[:num_good_matches]

        return kp1, kp2, good_matches

    def find_homography(
        self,
        kp1: List[cv2.KeyPoint],
        kp2: List[cv2.KeyPoint],
        matches: List[cv2.DMatch],
    ) -> Optional[np.ndarray]:
        """
        Find homography matrix between two sets of keypoints.

        Args:
            kp1: Keypoints from first image
            kp2: Keypoints from second image
            matches: Good matches between keypoints

        Returns:
            Homography matrix or None if not enough matches
        """
        if len(matches) < 4:
            return None

        # Extract matched keypoints
        src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

        # Find homography using RANSAC
        homography, mask = cv2.findHomography(
            src_pts, dst_pts, cv2.RANSAC, ransacReprojThreshold=5.0
        )

        return homography

    def warp_and_stitch(
        self, img1: np.ndarray, img2: np.ndarray, homography: np.ndarray
    ) -> np.ndarray:
        """
        Warp and stitch two images using homography.

        Args:
            img1: First image (base)
            img2: Second image (to be warped)
            homography: Homography matrix

        Returns:
            Stitched panorama image
        """
        h1, w1 = img1.shape[:2]
        h2, w2 = img2.shape[:2]

        # Get corners of second image
        corners2 = np.float32([[0, 0], [0, h2], [w2, h2], [w2, 0]]).reshape(-1, 1, 2)

        # Transform corners using homography
        transformed_corners = cv2.perspectiveTransform(corners2, homography)

        # Find bounding box of stitched image
        all_corners = np.concatenate(
            [
                np.float32([[0, 0], [0, h1], [w1, h1], [w1, 0]]).reshape(-1, 1, 2),
                transformed_corners,
            ],
            axis=0,
        )

        [x_min, y_min] = np.int32(all_corners.min(axis=0).ravel() - 0.5)
        [x_max, y_max] = np.int32(all_corners.max(axis=0).ravel() + 0.5)

        # Translation matrix to shift the result
        translation = np.array([[1, 0, -x_min], [0, 1, -y_min], [0, 0, 1]])

        # Warp second image
        result_width = x_max - x_min
        result_height = y_max - y_min
        warped_img2 = cv2.warpPerspective(
            img2, translation @ homography, (result_width, result_height)
        )

        # Create result image
        result = np.zeros((result_height, result_width, 3), dtype=np.uint8)

        # Place first image
        result[-y_min : -y_min + h1, -x_min : -x_min + w1] = img1

        # Blend with warped second image
        mask = (warped_img2 > 0).any(axis=2)
        result[mask] = warped_img2[mask]

        return result

    def create_panorama(
        self,
        video_path: str,
        output_path: Optional[str] = None,
        max_frames: Optional[int] = None,
    ) -> np.ndarray:
        """
        Create panorama from video file.

        Args:
            video_path: Path to input video
            output_path: Path to save output panorama (optional)
            max_frames: Maximum number of frames to process

        Returns:
            Panorama image as numpy array
        """
        logging.info(f"Creating panorama from video: {video_path}")

        # Extract frames
        frames = self.extract_frames(video_path, max_frames)

        if len(frames) < 2:
            raise ValueError("Need at least 2 frames to create panorama")

        # Start with first frame
        panorama = frames[0]

        # Process each subsequent frame
        for i, frame in enumerate(frames[1:], 1):
            logging.info(f"Processing frame {i}/{len(frames) - 1}")

            # Detect and match features
            kp1, kp2, matches = self.detect_and_match_features(panorama, frame)

            if len(matches) < 10:
                logging.warning(f"Not enough matches found for frame {i}, skipping...")
                continue

            # Find homography
            homography = self.find_homography(kp2, kp1, matches)  # Note: swapped order

            if homography is None:
                logging.warning(f"Could not find homography for frame {i}, skipping...")
                continue

            # Warp and stitch
            try:
                panorama = self.warp_and_stitch(panorama, frame, homography)
                logging.info(f"Successfully stitched frame {i}")
            except Exception as e:
                logging.error(f"Error stitching frame {i}: {e}")
                continue

        # Save if output path provided
        if output_path:
            cv2.imwrite(output_path, panorama)
            logging.info(f"Panorama saved to: {output_path}")

        return panorama

    def create_panorama_from_images(
        self, image_paths: List[str], output_path: Optional[str] = None
    ) -> np.ndarray:
        """
        Create panorama from a list of image files.

        Args:
            image_paths: List of paths to input images
            output_path: Path to save output panorama (optional)

        Returns:
            Panorama image as numpy array
        """
        logging.info(f"Creating panorama from {len(image_paths)} images")

        if len(image_paths) < 2:
            raise ValueError("Need at least 2 images to create panorama")

        # Load images
        images = []
        for path in image_paths:
            img = cv2.imread(path)
            if img is None:
                logging.warning(f"Could not load image: {path}")
                continue
            images.append(img)

        if len(images) < 2:
            raise ValueError("Could not load enough valid images")

        # Start with first image
        panorama = images[0]

        # Process each subsequent image
        for i, image in enumerate(images[1:], 1):
            logging.info(f"Processing image {i}/{len(images) - 1}")

            # Detect and match features
            kp1, kp2, matches = self.detect_and_match_features(panorama, image)

            if len(matches) < 10:
                logging.warning(f"Not enough matches found for image {i}, skipping...")
                continue

            # Find homography
            homography = self.find_homography(kp2, kp1, matches)  # Note: swapped order

            if homography is None:
                logging.warning(f"Could not find homography for image {i}, skipping...")
                continue

            # Warp and stitch
            try:
                panorama = self.warp_and_stitch(panorama, image, homography)
                logging.info(f"Successfully stitched image {i}")
            except Exception as e:
                logging.error(f"Error stitching image {i}: {e}")
                continue

        # Save if output path provided
        if output_path:
            cv2.imwrite(output_path, panorama)
            logging.info(f"Panorama saved to: {output_path}")

        return panorama
