import cv2 as cv

webcam = cv.VideoCapture(0)

if not webcam.isOpened():
    print 'Camera is not accessible'
else:
    cv.namedWindow('heartWindow', cv.WINDOW_AUTOSIZE)
    faceCascadeFileName = './cascades/haarcascade_frontalface_alt.xml'
    eyeCascadeFileName = './cascades/haarcascade_eye.xml'
    faceCascade = cv.CascadeClassifier(faceCascadeFileName)
    eyeCascade = cv.CascadeClassifier(eyeCascadeFileName)

    while webcam.isOpened():
        ret, frame = webcam.read()
        frameGray = cv.cvtColor(frame, cv.COLOR_BGR2GRAY)
        faces = faceCascade.detectMultiScale(frameGray,
                                             scaleFactor=1.3,
                                             minNeighbors=4,
                                             minSize=(30, 30),
                                             flags=cv.CASCADE_SCALE_IMAGE
                                             )
        for (x, y, w, h) in faces:
            cv.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 255), 2)
            frameGrayEye = frameGray[y:y + h, x:x + w]
            frameEye = frame[y:y + h, x:x + w]
            eyes = eyeCascade.detectMultiScale(frameGrayEye)
            for (ex, ey, ew, eh) in eyes:
                cv.rectangle(frameEye, (ex, ey), (ex + ew, ey + eh), (0, 0, 255), 2)

        cv.imshow('Heart Monitor', frame)
        if cv.waitKey(1) & 0xFF == ord('q'):
            break

webcam.release()
cv.destroyAllWindows()