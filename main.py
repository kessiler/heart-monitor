import cv2 as cv
import ctypes

webcam = cv.VideoCapture(0)

if not webcam.isOpened():
	print 'Camera is not accessible'
else:
	while(webcam.isOpened()):
		ret, frame = webcam.read()
		gray = cv.cvtColor(frame, cv.COLOR_BGR2GRAY)    	
		cv.imshow('frame', gray)
		if cv.waitKey(1) & 0xFF == ord('q'):
			break

webcam.release()
cv.destroyAllWindows()